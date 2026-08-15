# 실험 B — Multi-Zones (기각)

> **결론 먼저: 채택하지 않았다.**
> zone 경계를 넘을 때 **하드 내비게이션이 강제**되기 때문이다.
> 하드 내비게이션이면 SPA 설계를 할 이유가 사라진다.
> 실제 결제 경로는 `cart/CheckoutFlow` remote 로 옮겼다.
> → [02-architecture/03-ssr-and-soft-nav.md](../02-architecture/03-ssr-and-soft-nav.md)
>
> **앱은 삭제됐다(6차).** `apps/zone-checkout` 과 host 의 `/legacy-checkout` rewrite 는
> 저장소에 더 이상 없다. 아래 기록은 "왜 안 되는지"를 실측으로 남긴 것이라 그대로 둔다.
> 당시 경로는 `/checkout` → `/legacy-checkout` 이었다.

## 가설

경로 단위로 갈리는 영역은 별도 Next.js 16 앱으로 떼고 `rewrites` 로 위임하면,
Turbopack · App Router · SSR · RSC 를 전부 그대로 쓰면서 독립 배포가 된다.

## 구현

### host 쪽 (`apps/host/next.config.ts`)

```ts
async rewrites() {
  return [
    { source: "/checkout",             destination: `${ZONE}/checkout` },
    { source: "/checkout/:path*",      destination: `${ZONE}/checkout/:path*` },
    { source: "/checkout-static/:path*", destination: `${ZONE}/checkout-static/:path*` },
  ];
}
```

세 번째 규칙이 핵심이다. zone 의 정적 자산(`_next/static`)도 같은 도메인으로
프록시해야 브라우저가 청크를 받는다. 이걸 빠뜨리면 페이지는 뜨는데 JS 가 404 난다.

### zone 쪽 (`apps/zone-checkout/next.config.ts`)

```ts
{
  basePath: "/checkout",           // 모든 라우트에 prefix
  assetPrefix: "/checkout-static", // 정적 자산 경로를 host rewrite 와 1:1 매칭
}
```

### 링크

```tsx
// ❌ 안 됨 — host 라우터가 자기 라우트로 처리하려다 404
<Link href="/checkout">결제</Link>

// ✅ 하드 내비게이션
<a href="/checkout">결제</a>
```

## 결과 — 검증됨 ✅

| 항목 | 결과 |
| --- | --- |
| `http://localhost:3000/checkout` HTTP | 200 |
| 응답 주체 | zone-checkout (`zone: checkout` 라벨 확인) |
| `http://localhost:3003/checkout` 직접 접근 | 200, 동일 바이트 수 (13500) |
| SSR | ✅ 초기 HTML 에 주문서 내용 포함 |
| 장바구니 상태 인계 | ✅ `localStorage` 로 복원 — host 에서 담은 상품이 그대로 보임 |
| remote 청크 요청 | **0건** (MF 를 안 쓰므로 당연) |

브라우저 실측 본문:

```
결제 | 이 페이지는 host(3000)가 아니라 zone-checkout(3003) 이 렌더링했다.
| 주문서 | zone: checkout | 1개 | ⌨️ Aurora 75 기계식 키보드 × 1 | 189,000원 | 주문 확정
```

## 실험 A 와의 직접 비교

| | 실험 A (런타임 MF + 서버 로딩) | 실험 B (Multi-Zones) |
| --- | --- | --- |
| Next.js 16 / Turbopack | ⭕ | ⭕ |
| App Router | ⭕ | ⭕ |
| RSC | host 만 | 양쪽 다 |
| remote/zone SSR | **⭕** (node 번들 추가 빌드) | ⭕ (기본) |
| **경계 이동** | **소프트 (document 요청 0)** | **하드 (document 요청 1)** |
| 화면 안 조각 단위 합성 | **⭕** | ❌ (경로 단위) |
| 런타임 코드 공유 | **⭕** (React 1개) | ❌ (각자 번들) |
| 상태 공유 | **⭕** 즉시 (globalThis) | ⚠️ localStorage/쿠키 |
| 번들러 자유도 | **⭕** (Vite/Rspack 혼용) | ❌ (Next.js 고정) |
| 장애 격리 | remote 단위 (ErrorBoundary) | zone 단위 (프로세스 분리, 더 강함) |
| 빌드 복잡도 | 높음 (remote 당 2타깃) | **낮음** |
| 운영 난이도 | 높음 (버전 정합성, shared scope, 서버 신뢰 경계) | **낮음** |

## 기각 사유 — 소프트 내비게이션이 불가능하다

zone 마다 Next 라우터가 따로 있으므로 경계를 넘을 때 `next/link` 를 쓸 수 없다.
`<a href>` 로 문서를 통째로 다시 받아야 한다.

Playwright 로 document 요청 수를 센 실측:

| 이동 | document 요청 | 판정 |
| --- | --- | --- |
| `/` → `/checkout` (cart remote) | **0** | 소프트 ✅ |
| `/` → `/products/:id` (catalog remote) | **0** | 소프트 ✅ |
| `/` → `/legacy-checkout` (zone) | **1** | 하드 ❌ |

따라오는 손실:

- 전역 상태(장바구니, 인증 컨텍스트)가 메모리에서 날아가 매번 복원해야 한다
- 셸(헤더·레이아웃)이 다시 그려진다 — 깜빡임
- 페이지 전환 애니메이션·낙관적 UI 같은 SPA 기법을 경계에서 쓸 수 없다
- 이미 로드한 공용 JS 를 다시 받는다

"결제만 가끔 들어가는 화면이니 괜찮다"는 판단도 가능하지만,
그 지점부터는 SPA 를 유지할 이유가 사라진다.

## 판단 기준 (갱신)

```
경계를 넘을 때 하드 내비게이션이 허용되는가?
├─ 아니오 → 라우터를 host 하나로 두고 전부 remote 로  ← 이 저장소의 선택
│            SSR 이 필요하면 remote 를 node 타깃으로 한 벌 더 빌드
└─ 예 → 경로 단위로 팀이 완전히 갈리는가?
         ├─ 예 → Multi-Zones (운영이 훨씬 단순하다)
         └─ 아니오 → 모노레포 빌드타임 공유 (MFA 포기)
```

Multi-Zones 자체가 나쁜 기술은 아니다. **요구사항이 소프트 내비게이션이면 선택지에서 빠질 뿐이다.**
사내 어드민처럼 경로 단위로 조직이 갈리고 전환 UX 를 신경 쓰지 않는다면 여전히 최선의 선택이다.

## 다음 단계로 검토할 것

- `@vercel/microfrontends` (2.4.0) — Multi-Zones 를 제품화한 first-party 패키지.
  로컬 프록시, zone 간 prefetch, 배포 오케스트레이션을 제공한다.
  현재 이 저장소는 순수 `rewrites` 로만 구현해 동작 원리를 드러냈다.
