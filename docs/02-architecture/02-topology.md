# 토폴로지

## 런타임 구성도

```
                    브라우저                                  host 서버 (Node)
                       │                                          │
                       │  ① 초기 HTML (remote 마크업 포함)         │
                       │◀─────────────────────────────────────────┤
                       │                                          │  ③ fetch mf-server.cjs
                       │  ② hydrate: remoteEntry 로드              │     (node 타깃 CJS)
                       ▼                                          ▼
          ┌────────────────────────┐                ┌────────────────────────┐
          │ remote 웹 번들          │                │ remote 노드 번들        │
          │ dist/remoteEntry.js    │                │ dist/mf-server.cjs     │
          │ dist/mf-manifest.json  │                │ (react = external)     │
          └────────────────────────┘                └────────────────────────┘
                       ▲                                          ▲
                       └──────────── 같은 소스 ────────────────────┘
                          catalog :3001 (Vite) / cart :3002 (Rsbuild)


  host :3000  ─ Next.js 16 / Turbopack / App Router ─ 라우터는 여기 하나뿐
     ├── /              → catalog/ProductGrid  + cart/CartPanel   (소프트)
     ├── /products/:id  → catalog/ProductDetail                   (소프트)
     ├── /cart          → cart/CartPanel                          (소프트)
     ├── /checkout      → cart/CheckoutFlow                       (소프트)
     ├── /debug         → MF 진단
     └── /legacy-checkout → rewrite → zone-checkout :3003         (하드, 비교용)
```

## 앱 목록

| 앱 | 포트 | 번들러 | 역할 | 산출물 |
| --- | --- | --- | --- | --- |
| `apps/host` | 3000 | Next.js 16 / Turbopack | 셸 · 라우팅 · remote 소비(브라우저+서버) | `.next` |
| `apps/remote-catalog` | 3001 | Vite 8 | 상품 목록 / 상세 | `remoteEntry.js` + `mf-server.cjs` |
| `apps/remote-cart` | 3002 | Rsbuild 2 (Rspack) | 장바구니 / 배지 / **결제** | `remoteEntry.js` + `mf-server.cjs` |
| `apps/zone-checkout` | 3003 | Next.js 16 / Turbopack | Multi-Zone **비교용** (기각) | `.next` |

## 공유 패키지

| 패키지 | 역할 |
| --- | --- |
| `@mfa/contracts` | 도메인 타입 · 목 데이터 · 장바구니 싱글턴 · **remote 모듈 타입 계약** |
| `@mfa/ui` | 디자인 토큰 + 공용 컴포넌트(인라인 스타일 — CSS 파이프라인 차이 회피) |
| `@mfa/eslint-config` | ESLint 10 flat config (base / react / next) |
| `@mfa/typescript-config` | tsconfig 프리셋 (base / nextjs / react-library / vite) |

## 노출 모듈 계약

`packages/contracts/src/remote-contract.ts` 가 단일 진실 공급원(SSOT)이다.

```ts
export interface RemoteModuleMap {
  "catalog/ProductGrid":   { default: ComponentType<ProductGridProps> };
  "catalog/ProductDetail": { default: ComponentType<ProductDetailProps> };
  "cart/CartPanel":        { default: ComponentType<CartPanelProps> };
  "cart/CartBadge":        { default: ComponentType<CartBadgeProps> };
  "cart/CheckoutFlow":     { default: ComponentType<CheckoutFlowProps> };
}
```

같은 키가 **세 곳**에서 1:1 로 맞아야 한다.

| 위치 | 형태 |
| --- | --- |
| remote 웹 빌드 `exposes` | `"./CheckoutFlow": "./src/exposes/CheckoutFlow.tsx"` |
| remote 서버 진입점 맵 | `"./CheckoutFlow": CheckoutFlow` |
| host 타입 계약 | `"cart/CheckoutFlow"` |

어긋나면 런타임에야 발견된다. `/debug` 가 manifest 의 실제 `exposes` 를 보여주는 이유다.

## host 의 이중 로딩 경로

```ts
loadRemoteModule("cart/CheckoutFlow")
  │
  ├─ typeof window === "undefined"   →  server-loader.ts
  │                                     fetch(mf-server.cjs) → new Function(...) → React 주입
  │
  └─ 브라우저                          →  @module-federation/runtime
                                         init({ shared: { react: { lib: () => React } } })
                                         loadRemote("cart/CheckoutFlow")
```

두 경로가 **같은 소스에서 나온 같은 컴포넌트**를 돌려주므로 마크업이 일치하고 hydration 이 성립한다.

## 공유 모듈 목록

host 는 브라우저 쪽에 5개를 공유한다. 루트만으로 충분해 보이지만
`@module-federation/vite` 가 서브엔트리를 shared 목록에 자동으로 올리므로 전부 제공해야 한다.

| 모듈 | 프로브 | 비고 |
| --- | --- | --- |
| `react` | `useState` | 싱글턴 필수 — 어기면 `Invalid hook call` |
| `react-dom` | `createPortal` | |
| `react-dom/client` | `createRoot` | 빠지면 `Failed to bridge external shared module` |
| `react/jsx-runtime` | `jsx` | |
| `react/jsx-dev-runtime` | `jsxDEV` | dev 전용 경로 |

넘기는 값은 `apps/host/src/mf/interop.ts` 의 `normalizeModule(mod, probe)` 로 정규화한다.
`import * as X` 결과가 `{ default: {...} }` 로 오는 경우가 있어서다.

서버 쪽(`server-loader.ts`)은 MF shared 를 쓰지 않고 **require 셰임**으로 같은 4개를 주입한다.
remote 의 node 번들이 `require("react/jsx-runtime")` 를 그대로 호출하기 때문이다.

## MF 자동 타입(DTS)은 꺼져 있다

두 remote 모두 `dts: false`. 근거는 두 가지다.

- 타입 계약의 SSOT 가 `@mfa/contracts` 의 `RemoteModuleMap` 이라 정보가 중복
- host 가 타입을 소비하려면 typecheck 전에 remote 가 HTTP 로 떠 있어야 한다 (CI 순서 의존)

> `[ dynamic-remote-type-hints-plugin ] err: [object Event]` 콘솔 에러는 **이 결정의 근거가 아니다.**
> 그건 `dev.disableDynamicRemoteTypeHints` 로 따로 끌 수 있다.
> 상세: [01-research/03-dts-plugin-review.md](../01-research/03-dts-plugin-review.md)

## 데이터 흐름 — 장바구니

```
catalog remote              cart remote                 cart remote
  "담기" 클릭                 CartBadge                   CheckoutFlow
      │                          ▲                            ▲
      ▼                          │ useSyncExternalStore       │
  getCartStore().add(p) ─────────┴────────────────────────────┘
      │
      ▼
  globalThis.__MFA_CART_STORE__   ──persist──▶  localStorage["mfa-nextjs:cart"]
```

- 전부 host 페이지 안이므로 **소프트 내비게이션 중 상태가 메모리에 그대로 남는다.**
- `localStorage` 는 새로고침 복원용이지 경계 통신 수단이 아니다.
  (Multi-Zones 였다면 경계마다 이 왕복이 강제됐다)
- SSR 스냅샷은 항상 빈 장바구니 → hydration mismatch 없음.
