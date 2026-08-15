# remote SSR + 소프트 내비게이션

요구사항 두 개가 아키텍처를 결정했다.

1. **remote 영역이 SSR 되어야 한다**
2. **경계를 넘을 때 소프트 내비게이션이어야 한다** — 하드 내비게이션이면 SPA 설계 자체가 무의미

이 둘을 동시에 만족하는 조합은 하나뿐이다.

| 방식 | remote SSR | 소프트 내비게이션 | 판정 |
| --- | --- | --- | --- |
| Multi-Zones | ⭕ | ❌ zone 경계에서 강제 하드 내비 | **탈락** |
| 런타임 MF (CSR only) | ❌ | ⭕ | **탈락** |
| **런타임 MF + 서버 사이드 remote 로딩** | **⭕** | **⭕** | **채택** |

## 1. 소프트 내비게이션은 "라우팅 소유권" 문제다

경계를 넘을 때 하드 내비게이션이 나는 이유는 하나다. **라우터가 둘이기 때문**이다.
Multi-Zones 는 zone 마다 Next 라우터가 따로 있어서 `next/link` 로 넘어갈 수 없다.

해결책도 하나다. **라우터를 하나만 둔다.**

```
❌ Multi-Zones                        ✅ remote

host router ──┐                       host router (유일)
              │ 하드 내비                   ├── /            → catalog/ProductGrid
zone router ──┘                            ├── /products/:id → catalog/ProductDetail
                                           ├── /cart        → cart/CartPanel
                                           └── /checkout    → cart/CheckoutFlow
```

그래서 결제 화면을 zone 에서 **cart remote 로 옮겼다**(`cart/CheckoutFlow`).
`/checkout` 은 이제 host 라우트이고, 그 안을 remote 가 그린다.
라우팅은 host, 렌더링은 remote — 경계가 라우터를 가르지 않는다.

remote 는 여전히 라우터를 모른다. 이동은 콜백으로 host 에 위임한다.

```tsx
// host
<RemoteComponent
  module="cart/CheckoutFlow"
  props={{ onDone: () => router.push("/") }}   // 소프트
/>
```

### 측정값 (Playwright, 프로덕션 빌드)

| 이동 | document 요청 증가 | 판정 |
| --- | --- | --- |
| `/` → `/checkout` (remote) | **0** | 소프트 ✅ |
| `/` → `/products/:id` (remote) | **0** | 소프트 ✅ |
| `/` → `/legacy-checkout` (zone·삭제됨) | **1** | 하드 ❌ |

## 2. remote SSR — host 서버가 remote 의 node 번들을 실행한다

### 왜 기존 방법이 안 되나

- `@module-federation/nextjs-mf`: Next 16 미지원 ([근거](../01-research/01-nextjs-mf-eol.md))
- `@module-federation/node`: peer 가 `webpack ^5.40`. host 는 Turbopack 이라 webpack 이 없다

### 구조 — remote 를 두 벌 빌드한다

```
remote (catalog / cart)
├── dist/remoteEntry.js + mf-manifest.json   ← 브라우저용 (웹 타깃, MF 플러그인)
└── dist/mf-server.cjs                       ← 서버용 (node 타깃 CJS, react external)
```

host 의 `loadRemoteModule(id)` 하나가 실행 환경에 따라 갈린다.

```ts
export function loadRemoteModule(id) {
  if (typeof window === "undefined") return loadRemoteModuleOnServer(id); // mf-server.cjs
  return loadOnClient(id);                                                // remoteEntry
}
```

### 서버 로더 (`apps/host/src/mf/server-loader.ts`)

1. remote 의 `mf-server.cjs` 를 HTTP 로 가져온다
2. **host 의 React 를 `require` 셰임으로 주입하며** 평가한다
3. expose 키 → 컴포넌트 맵을 돌려준다

```ts
const factory = new Function("module", "exports", "require", code);
factory(moduleObj, moduleObj.exports, (id) => INJECTED[id]);
```

`node:vm` / `node:fs` 를 쓰지 않은 이유: 이 모듈은 client component 트리에서 import 되므로
브라우저 번들에도 들어간다. node builtin 을 넣으면 Turbopack 이 브라우저 번들에서 터진다.
`fetch` + `new Function` 만 쓰면 한 파일로 양쪽을 통과한다(호출은 서버에서만).

React 를 external 로 두는 게 핵심이다. remote 서버 번들이 자기 React 를 들고 오면
서버에서도 React 가 2벌이 되어 훅이 깨진다.

실제 산출물이 요구하는 external (검증됨):

```
catalog/mf-server.cjs → require: react, react/jsx-runtime
cart/mf-server.cjs    → require: react, react/jsx-runtime
```

### 결과 — 초기 HTML 에 remote 마크업이 들어간다

```bash
$ curl -s localhost:3000/products/kb-001 | grep -c "Aurora 75"
1
$ curl -s localhost:3000/checkout | grep -c "주문서"
1
```

| 경로 | remote 마크업 in HTML | 렌더 형태 |
| --- | --- | --- |
| `/products/:id` | ✅ | 셸에 인라인 |
| `/cart` | ✅ | 셸에 인라인 |
| `/checkout` | ✅ | 셸에 인라인 |
| `/` | ✅ | 큰 경계는 React 스트리밍으로 뒤 청크에 |

`/` 의 상품 그리드는 React Fizz 가 Suspense 경계를 별도 청크로 흘려보낸다.
**같은 HTTP 응답 안에 마크업이 그대로 들어있으므로 SSR 은 성립한다.**
셸에는 스켈레톤이 먼저 나가고 뒤이어 실제 마크업 + 치환 스크립트가 온다(React 표준 동작).

### 하이드레이션

서버는 `mf-server.cjs` 의 컴포넌트로, 브라우저는 `remoteEntry` 의 컴포넌트로 렌더한다.
**소스가 같으므로 마크업이 일치한다.** 브라우저 콘솔 하이드레이션 경고 0건 확인.

장바구니 상태는 `useSyncExternalStore` 의 서버 스냅샷을 빈 값으로 두어
SSR/CSR 불일치를 원천 차단했다.

## 3. 정적 프리렌더를 끈 이유

remote 를 SSR 하는 페이지는 전부 `force-dynamic` 이다.

```ts
export const dynamic = "force-dynamic";
```

빌드 시점에 굳히면 remote 를 재배포해도 host 가 옛 마크업을 계속 내보낸다.
**독립 배포라는 MFA 의 전제가 깨진다.**

## 4. 남은 트레이드오프

| 항목 | 내용 |
| --- | --- |
| 빌드 2벌 | remote 마다 웹/노드 타깃을 둘 다 빌드해야 한다 |
| 신뢰 경계 | host **서버**가 remote 코드를 실행한다. origin 허용목록 + 무결성 검증 필요 |
| 서버 지연 | 콜드 스타트 시 remote 번들 fetch 1회. 이후 프로세스 캐시(prod) |
| RSC 불가 | remote 는 여전히 클라이언트 컴포넌트다. 서버 컴포넌트를 federate 할 수는 없다 |
| Edge 런타임 불가 | `new Function` 평가가 필요해 Node 런타임 전용 |

## 5. Multi-Zone 앱은 어떻게 됐나

`apps/zone-checkout` 을 `/legacy-checkout` 에 대조군으로 두고 헤더에서 두 내비게이션을
번갈아 눌러 성격 차이를 확인할 수 있게 했었다. 위 표의 측정값이 그때 나온 것이다.

측정이 끝나고 결론이 확정된 뒤로는 유지 비용만 남아 **6차에서 앱과 rewrite 를 삭제했다.**
기각 근거는 [04-experiments/02-multi-zones.md](../04-experiments/02-multi-zones.md) 에 남아 있다.
