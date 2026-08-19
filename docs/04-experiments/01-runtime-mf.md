# 실험 A — 런타임 전용 Module Federation

> **이 문서는 1차(2026-08-14) 실험 기록이다.** 가설과 측정값은 그때 것 그대로 둔다.
> 이후 SSR · 소프트 내비게이션 · 버전 공표 · 캐시 · 컨테이너 배포가 얹히면서 저장소는
> 많이 달라졌다. 지금 구조는 [02-architecture/02-topology.md](../02-architecture/02-topology.md)
> 를 본다. 아래 성능 표의 "5 라우트" 같은 수치도 그 시점의 값이다.

## 가설

Next.js 16(Turbopack) host 에 **번들러 플러그인 없이** `@module-federation/runtime` 만
넣으면, Vite / Rsbuild 로 각각 빌드된 remote 를 소비할 수 있다.

## 구현

### host — 번들러 설정 0줄

`apps/host/next.config.ts` 에 MF 관련 설정이 **하나도 없다**. 전부 런타임 코드다.

`apps/host/src/mf/runtime.ts`:

```ts
init({
  name: 'host',
  remotes: [
    { name: 'catalog', entry: CATALOG_ENTRY },
    { name: 'cart', entry: CART_ENTRY },
  ],
  shared: {
    react: {
      version: '19.2.8',
      scope: 'default',
      lib: () => React, // host 인스턴스를 직접 주입
      shareConfig: { singleton: true, requiredVersion: '^19.0.0' },
    },
    // react-dom, react-dom/client, react/jsx-runtime, react/jsx-dev-runtime 동일
  },
});
```

### remote — 각자 자기 번들러의 MF 플러그인

`remote-catalog` (Vite 8):

```ts
federation({
  name: "catalog",
  filename: "remoteEntry.js",
  manifest: true,
  exposes: { "./ProductGrid": "./src/exposes/ProductGrid.tsx", ... },
  shared: { react: { singleton: true, requiredVersion: "^19.0.0" }, ... },
})
```

`remote-cart` (Rsbuild 2):

```ts
pluginModuleFederation({
  name: "cart",
  filename: "remoteEntry.js",
  exposes: { "./CartPanel": "./src/exposes/CartPanel.tsx", ... },
  shared: { react: { singleton: true }, ... },
})
```

> **갱신 (2026-08-14 2차)** — 이 문서는 SSR 을 포기한 **초판 실험** 기록이다.
> 이후 "remote SSR 필수 + 소프트 내비게이션 필수" 요구로 아키텍처가 확장됐다.
> 최종 설계는 [02-architecture/03-ssr-and-soft-nav.md](../02-architecture/03-ssr-and-soft-nav.md) 참고.
> 아래 "확인된 제약 1" 은 해소되었다.

## 결과 — 검증됨 ✅

Playwright(Chromium) 실측:

| 항목                              | 결과                                 |
| --------------------------------- | ------------------------------------ |
| `/` 에서 catalog remote 렌더링    | ✅ 상품 카드 8개                     |
| `/` 에서 cart remote 배지 렌더링  | ✅                                   |
| remote 청크 요청 수               | 33건 (3001/3002 합산)                |
| 콘솔 에러                         | **0건** (`Invalid hook call` 없음)   |
| `window.__FEDERATION__.__SHARE__` | 스코프 3개                           |
| catalog 에서 "담기" → cart 배지   | `🛒 0 / 0원` → `🛒 1 / 189,000원` ✅ |
| `/products/kb-001` 상세 remote    | ✅ `h3 = "Aurora 75 기계식 키보드"`  |
| `/debug` manifest 프로브          | catalog `ok`, cart `ok`              |

**서로 다른 번들러(Vite ↔ Rspack)로 빌드된 두 remote 가 host 의 React 하나를 공유하고,
전역 스토어로 상태까지 주고받는다.**

## 확인된 제약

### 1. remote 는 SSR 안 됨 → **해소됨**

초판에서는 `curl http://localhost:3000/` 의 초기 HTML 에 상품 카드가 없고 스켈레톤만 있었다.

이후 remote 를 **node 타깃 CJS 번들로 한 벌 더 빌드**하고 host 서버가 그것을 가져와
자기 React 를 주입하며 렌더하도록 바꿔 해소했다.
지금은 초기 HTML 에 remote 마크업이 들어간다.

```
$ curl -s localhost:3000/products/kb-001 | grep -c "Aurora 75"   # 1
$ curl -s localhost:3000/checkout        | grep -c "주문서"       # 1
```

구현: [02-architecture/03-ssr-and-soft-nav.md](../02-architecture/03-ssr-and-soft-nav.md)

### 2. `next build` 프리렌더가 remote 를 잡는다

`React.lazy` 팩토리가 프리렌더 중 실행되면서 빌드가 깨졌다.

```
Error occurred prerendering page "/"
Error: Module Federation 런타임은 브라우저에서만 초기화할 수 있습니다
```

**해결**: 하이드레이션 이후에만 로드.

```tsx
const noopSubscribe = () => () => {};
function useIsClient() {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
}
```

`useEffect` + `setState` 대신 `useSyncExternalStore` 를 쓴 이유는
`eslint-plugin-react-hooks@7` 의 `set-state-in-effect` 룰 때문. 자세한 건
[05-troubleshooting](../05-troubleshooting/01-known-issues.md).

### 3. `lazy()` 는 모듈 스코프에서 캐싱해야 함

렌더마다 `lazy()` 를 새로 만들면 remote 컴포넌트 상태가 매번 초기화된다.
`react-hooks/static-components` 룰이 이걸 잡아준다.

```ts
const lazyCache = new Map<
  RemoteModuleId,
  ComponentType<Record<string, unknown>>
>();
```

## 성능 관찰

| 앱                       | 빌드 시간    | 산출물                                                 |
| ------------------------ | ------------ | ------------------------------------------------------ |
| remote-catalog (Vite 8)  | ~1.4s        | remoteEntry 0.17 kB + 청크 분리                        |
| remote-cart (Rsbuild 2)  | ~1.3s        | remoteEntry 115.7 kB (32.5 kB gzip)                    |
| host (Next 16 Turbopack) | ~0.4s 컴파일 | 5 라우트 (1차 시점. 지금은 실험·내부 라우트가 더 있다) |

Vite 쪽 `remoteEntry.js` 가 0.17 kB 로 작은 건 ESM 동적 import 로 잘게 쪼개기 때문이고,
Rsbuild 쪽은 런타임을 remoteEntry 에 인라인하기 때문이다. 둘 다 정상.

## 언제 이 방식을 쓰나

| 쓸 만한 경우                         | 피해야 할 경우                                     |
| ------------------------------------ | -------------------------------------------------- |
| 위젯 단위로 팀이 갈리는 화면         | RSC 로 서버 데이터를 흘려야 하는 영역              |
| 프레임워크/번들러가 섞인 조직        | Edge 런타임에서 돌려야 하는 라우트                 |
| 소프트 내비게이션이 필수인 SPA 성 UX | remote 를 신뢰할 수 없는 외부 조직이 배포하는 경우 |

CSR-only 로 둘지, node 번들까지 만들어 SSR 할지는 페이지 단위로 고를 수 있다.
SEO/LCP 가 중요하면 SSR 경로를, 로그인 이후 화면이면 CSR-only 로 두어 빌드를 아껴도 된다.
