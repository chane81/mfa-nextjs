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
     ├── /                    → catalog/ProductGrid + cart/CartPanel  (소프트)
     ├── /products/:id        → catalog/ProductDetail                 (소프트)
     ├── /cart                → cart/CartPanel                        (소프트)
     ├── /checkout            → cart/CheckoutFlow                     (소프트)
     ├── /debug               → MF 진단 (두 remote 의 실제 entry·exposes)
     ├── /lab                 → 캐시 실험 인덱스
     │    ├── /lab/ssr        → 요청마다 렌더 (connection() + Suspense)
     │    ├── /lab/isr        → "use cache" + cacheLife({ revalidate: 60 })
     │    └── /lab/cache      → "use cache" + cacheTag(remote) — 태그 무효화
     ├── /internal/mf-warm    → 무효화 직후 remote 선 warm (시크릿 필요)
     ├── /api/mf-revalidate   → remote 재배포 웹훅 수신 → 태그 만료
     └── /api/lab/stats       → 실험 패널이 읽는 로더 카운터 (DELETE 는 로컬 전용)
```

`/internal/*` 은 `apps/host/src/proxy.ts` 가 시크릿 헤더로 막는다. Next 16 에서
`middleware` 파일 규약이 `proxy` 로 바뀌었고, 렌더 파이프라인 **앞**에서 도는 덕에
진짜 404 를 낼 수 있다(페이지 안 `notFound()` 는 200 으로 나간다 — 실측).

같은 proxy 가 `DELETE /api/lab/stats` 도 프로덕션에서 404 로 자른다. 이 저장소는
공개라 경로도 공개되는데, 그건 **인증 없이 서버 상태(로더 카운터)를 바꾸는** 유일한
경로였다. 리셋이 필요한 실험은 로컬에서 돌리므로 배포본에 남길 이유가 없다.
읽기(`GET`)는 그대로 둔다 — 노출값이 remote 의 entry·버전인데 remote 가
`mf-version.json` 으로 이미 공개하는 것이고, `/lab` 화면과 배포 검증 절차
(`04-remote-lifecycle.md`)가 쓴다. `/debug` 도 같은 이유로 열려 있다.

## 앱 목록

| 앱                    | 포트 | 번들러                 | 역할                                     | 산출물                                                                   |
| --------------------- | ---- | ---------------------- | ---------------------------------------- | ------------------------------------------------------------------------ |
| `apps/host`           | 3000 | Next.js 16 / Turbopack | 셸 · 라우팅 · remote 소비(브라우저+서버) | `.next` (standalone)                                                     |
| `apps/remote-catalog` | 3001 | Vite 8                 | 상품 목록 / 상세                         | `/v<version>/` 아래 웹·노드 번들 + `style.css`, 루트에 `mf-version.json` |
| `apps/remote-cart`    | 3002 | Rsbuild 2 (Rspack)     | 장바구니 / 배지 / **결제**               | 위와 동일                                                                |

remote 자산은 **버전 디렉터리 아래 불변 경로**에 올라가고, 루트의 `mf-version.json` 하나가
"지금 어느 버전인지"를 공표한다. host 는 그 파일을 읽고 따라온다 —
상세는 [04-remote-lifecycle.md](./04-remote-lifecycle.md).

세 앱 모두 자기 `Dockerfile` 을 갖는다. Dokploy 에는 **앱마다 별도 Application** 으로 올린다
([03-setup/04-dokploy.md](../03-setup/04-dokploy.md)).

## 공유 패키지

| 패키지                   | 역할                                                                        |
| ------------------------ | --------------------------------------------------------------------------- |
| `@mfa/contracts`         | 도메인 타입 · 목 데이터 · **remote 모듈 타입 계약** (쿠키 포맷은 여기 없다) |
| `@mfa/store`             | **런타임 공유 상태 SSOT** — 도메인별 폴더. 훅 + 쿠키 코덱(`/cart-cookie`)   |
| `@mfa/remote-config`     | **remote 배치의 SSOT** — 이름 · 포트 · env 이름 · 산출물 파일명 · URL 조립  |
| `@mfa/tailwind-config`   | **디자인 토큰 SSOT** — Tailwind v4 `@theme` + PostCSS 설정 원본             |
| `@mfa/ui`                | 공용 컴포넌트 — Tailwind 클래스만 내보내고 CSS 는 만들지 않는다             |
| `@mfa/eslint-config`     | ESLint 10 flat config (base / react / next)                                 |
| `@mfa/typescript-config` | tsconfig 프리셋 (base / nextjs / react-library / vite)                      |

`@mfa/remote-config` 만 **빌드 산출물이 없다**. `exports` 가 소스 `.ts` 를 직접 가리킨다.
번들러 config(`vite.config.ts` · `rsbuild.config.ts`)가 프로세스 시작 즉시 이 모듈을 읽는데,
그 시점엔 watch 빌드가 `dist/` 를 만들 틈이 없기 때문이다. Node 24 의 타입 스트리핑이
`.ts` 를 그대로 실행해주는 덕에 성립한다 — `engines.node` 가 `>=24.19.0` 인 이유다.

`@mfa/tailwind-config` 도 빌드하지 않는다. `theme.css` 를 **소스 그대로** 내보내고
세 앱이 각자 자기 파이프라인에서 컴파일한다(host·cart 는 `@tailwindcss/postcss`,
catalog 는 `@tailwindcss/vite`). 공유 CSS 를 한 번 빌드해 배포하면 remote 가 새 클래스를
쓸 때마다 그 공유 산출물을 다시 배포해야 하고, 그러면 배포 단위가 다시 하나로 묶인다.
같은 유틸리티가 여러 CSS 에 중복되지만 값이 같고, 캐스케이드 레이어는 이름이 같으면
병합되므로 나중에 로드된 remote CSS 가 host 유틸리티를 덮지 않는다.

### 왜 `@mfa/contracts` 가 아니라 별도 패키지인가

contracts 는 **타입 계약**이다 — remote 가 무엇을 노출하고 props 모양이 어떤지.
장바구니 스토어는 **런타임 상태**다. 값이 시간에 따라 변하고 구독자가 있고 쿠키를
만진다. 둘을 한 패키지에 두면 타입만 필요한 소비처까지
zustand 와 DOM 타입을 끌고 온다. 실제로 contracts 의 tsconfig 에는 스토어 때문에 넣은
`lib: ["DOM", ...]` 이 있었고, 분리하면서 지웠다.

cart remote 안에 두는 안은 접었다. **catalog remote 도 스토어에 쓴다**("담기" 버튼).
앱끼리 소스를 import 하면 독립 배포 전제가 깨지고, 대신 cart 가 스토어를 expose 하고
catalog 가 그걸 런타임에 로드하면 remote → remote 의존이 생긴다(지금 규칙은 "remote 는
host 하고만 대화한다"). 소유자가 없는 상태라는 성질은 [ADR-004](./01-decision.md) 그대로다.

## 노출 모듈 계약

**이름은 `@mfa/contracts`, 타입은 remote 가 소유한다.** (ADR-019)

```ts
// packages/contracts/src/generated/module-ids.ts — 자동 생성물. 손으로 고치지 않는다
export const MODULE_IDS = [
  'cart/CartBadge',
  'cart/CartPanel',
  'cart/CheckoutFlow',
  'catalog/ProductDetail',
  'catalog/ProductGrid',
] as const;
```

`pnpm mf:types` 가 DTS 의 `RemoteKeys` 에서 뽑는다(`scripts/gen-module-ids.ts`).
순서는 계약이 아니라 출력을 결정적으로 만들려고 정렬한 결과다. 접두사가 remote 이름인지는
`contract-check.ts` 가 타입으로 본다.

```tsx
// apps/remote-catalog/src/exposes/ProductGrid.tsx — 표면은 구현 옆에
export interface ProductGridProps {
  category?: ProductCategory | 'all';
  onSelect?: (product: Product) => void;
}
export default function ProductGrid({ … }: ProductGridProps) { … }
```

host 는 그 props 를 **MF DTS 로 받는다.** 손으로 적는 타입 표는 없다 — DTS 가
`@module-federation/runtime` 을 모듈 확장하며 `loadRemote()` 시그니처를 좁혀놓으므로,
그 반환 타입을 되꺼내 쓴다(`@mfa/contracts/remote` 의 `RemoteModule<K>`).

props 를 계약 패키지로 올리지 않는 이유: 올리면 host 와 remote 가 같은 선언을 가리켜
DTS 가 전달할 정보가 0 이 된다(known-issues I-2).

### 같은 키가 네 곳에서 맞아야 한다

| 위치                          | 형태                                                 | 누가 검사하나                                                                  |
| ----------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------ |
| remote 웹 빌드 `exposes`      | `"./CheckoutFlow": "./src/exposes/CheckoutFlow.tsx"` | 디렉터리 스캔이라 자동                                                         |
| remote 서버 진입점 맵         | `"./CheckoutFlow": CheckoutFlow`                     | 손으로 적는다 — `pnpm build` 의 host 프리렌더가 그 번들을 실제로 실행해 잡는다 |
| `MODULE_IDS`                  | `"cart/CheckoutFlow"`                                | 생성물 — `contract-check.ts` 의 타입 단언, 낡음은 CI 의 `mf:types` diff        |
| remote 가 공표한 `RemoteKeys` | DTS 산출물                                           | 같은 단언의 반대편                                                             |

마지막이 host 관점의 안전장치다 — remote 의 **빌드가 실제로 무엇을 내보냈는지**까지
반영한다. 런타임 형태(manifest 의 실제 `exposes`)는 `/debug` 가 보여준다.

### 모듈을 하나 추가하는 절차

1. remote 에 `src/exposes/NewThing.tsx` — props 도 그 파일 안에 `export`
2. `pnpm mf:types` 후 생성물(`packages/contracts/src/generated/`)을 같이 커밋

**등록하는 자리가 없다.** 타입도 런타임 목록도 그 디렉터리에서 파생된다 —
`src/exposes/` → `exposes` 설정(`readExposes`) → DTS `RemoteKeys` → `MODULE_IDS`.

host 소스는 손대지 않는다. remote 를 **새로** 추가할 때만 세 줄이 는다 —
`remote-contract.ts` 의 `RemoteKeys` import, 그리고 contracts · host 양쪽 tsconfig 의
`paths` 매핑(`.d.ts` 안의 bare specifier 는 읽는 쪽 설정으로 해석된다).

## remote 의 CSS 는 어떻게 따라오나

> CSS 를 **누가 컴파일하는가**(공유 패키지가 아니라 각 앱이다)와 토큰 구조는
> [05-styling.md](./05-styling.md) 에 있다. 여기서는 전달 계약만 다룬다.

remote 컴포넌트는 host 페이지 안에서 렌더되는데, **CSS 는 두 로딩 경로 어디로도 따라가지
않는다.** 브라우저에서는 MF 런타임이 모듈만 가져오고(번들러의 CSS 주입 런타임은 remote
자신의 HTML 진입점에 붙어 있다), 서버에서는 host 가 CJS 문자열을 평가할 뿐이라 스타일시트를
실어 보낼 자리가 없다.

그래서 **host 가 remote 를 소비하는 자리에서 `<link>` 를 함께 건다.**

```tsx
// apps/host/src/mf/components/RemoteComponent.tsx — 모든 remote 소비가 지나가는 단일 진입점
<link
  rel="stylesheet"
  href={`${WEB_ORIGINS[remoteName]}${stylesPath(remoteVersion(remoteName))}`}
  precedence="mfa-remote"
/>
```

React 19 는 `precedence` 가 붙은 `<link>` 를 `<head>` 로 올리고 같은 `href` 를 중복 제거한다.
SSR HTML 에도 들어가고 소프트 내비게이션에서도 동작하며, 한 화면에 같은 remote 의 expose 를
몇 개 놓든 `<link>` 는 하나만 남는다.

### 왜 remote 쪽이 아니라 host 쪽인가

처음에는 remote 의 expose 마다 `<RemoteStyles />` 를 렌더해 remote 가 자기 주소를 선언했다.
계약이 remote 안에 닫혀 host 코드에 remote CSS 지식이 0 이라는 장점이 있었지만, **expose 를
추가할 때마다 잊으면 조용히 깨지는** 구조였다(스타일 없는 화면이 나오고 에러는 없다).

`RemoteComponent` 는 이미 서버·브라우저 두 로딩 경로와 장애 격리를 모두 감싸는 단일
진입점이다. 여기서 한 번 걸면 반복이 사라지고 누락이 불가능해진다. host 가 remote 의 파일
레이아웃을 아는 셈이지만 새 결합은 아니다 — 주소를 만드는 곳은 SSOT 하나고, `webEntryUrl`
이 이미 같은 패턴을 쓴다. 피해야 하는 건 **host 가 remote 매니페스트를 파싱해 자산 경로를
캐내는** 쪽이고 그건 지금도 하지 않는다.

`<link>` 를 host 의 `layout.tsx` 에 두는 안도 검토했다가 접었다. layout 은 모든 라우트에
걸리므로 remote 를 하나도 안 그리는 페이지까지 remote 를 로드하게 되고, 장애 시 에러 표시가
모든 페이지 최상위로 올라가며, CSS 를 받으려고 MF 모듈 왕복(매니페스트 → remoteEntry →
청크)이 선행된다. `<link>` 는 HTML 에 처음부터 있는 게 가장 빠른데 정반대다. 실측으로도
지금 구조는 `/cart` 가 cart CSS 만 받는다.

| 제약                                     | 이유                                                                                                                                            |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| 파일명 고정 `style.css` (해시 X)         | host 가 주소를 **계산으로** 알아야 한다. 해시가 붙으면 매니페스트를 파싱해 캐내야 하고 그 순간 remote 의 빌드 산출물 구조에 묶인다              |
| 오리진은 `WEB_ENTRIES` 에서 파생         | `publicOrigin` 은 동적 env 접근이라 **브라우저 번들에서 치환되지 않는다.** 그대로 쓰면 배포에서 `localhost` 를 가리키고 하이드레이션도 어긋난다 |
| CSS 를 한 파일로 (`cssCodeSplit: false`) | expose 마다 쪼개지면 가리킬 주소가 여러 개가 되고 그 목록이 다시 계약이 된다                                                                    |
| `<link>` 는 `Suspense` 밖                | 안에 두면 remote 번들을 기다리는 동안 스타일시트 요청이 시작되지 않는다                                                                         |
| dev 전용 미들웨어 (catalog)              | dev 의 Vite 는 CSS 를 `<style>` 주입 **JS 모듈**로 서빙한다. `<link>` 로 받으면 브라우저가 조용히 무시하므로 `?direct` 로 순수 CSS 를 돌려준다  |

## host 의 MF 계층 (`apps/host/src/mf/`)

목적축으로 여섯 폴더다. 나눈 근거와 "새 파일을 어디에 두나"는
[06-host-mf-layout.md](./06-host-mf-layout.md) 에 있다.

| 파일                               | 역할                                                                                     |
| ---------------------------------- | ---------------------------------------------------------------------------------------- |
| `config/index.ts`                  | remote 주소 · 호출 예산. **remote 이름이 한 줄도 없다** — 전부 `@mfa/remote-config` 파생 |
| `versions/server.ts`               | remote 가 **공표한** 버전(`announcedVersion`) · 조회 · 인스턴스 수렴                     |
| `versions/browser.ts`              | 서버가 **심어준** 값(`injectedEntry`). 의존 0 인 잎                                      |
| `versions/index.ts`                | `remoteVersion` — 렌더 코드의 유일한 버전 창구                                           |
| `state/cell.ts`                    | `globalCell` — RSC · SSR 레이어를 넘는 값의 유일한 자리                                  |
| `state/warm.ts`                    | **적재된** 버전 · warm 세대. 버전이 아니라 "그 버전으로 뭘 했나"                         |
| `state/loader-stats.ts`            | 로더 카운터. `/api/lab/stats` 가 읽는다                                                  |
| `trust/index.ts`                   | 허용 오리진 → 경로 형태 검증 → SRI/Ed25519 서명, 세 겹                                   |
| `loader/index.ts`                  | isomorphic 창구 + 브라우저 MF `init` — React 5개를 `lib` 로 직접 주입                    |
| `loader/server.ts`                 | 서버 경로 — `mf-server.cjs` fetch → `new Function` 평가 → 컴포넌트 맵                    |
| `loader/react-modules.ts`          | 공유 모듈 **이름과 프로브 표** + `import * as X` 결과 모양 정규화                        |
| `components/RemoteComponent.tsx`   | 서버/브라우저 두 경로를 감싸는 소비 진입점                                               |
| `components/RemoteBoundary.tsx`    | remote 하나가 죽어도 host 가 안 죽게 격리                                                |
| `components/RemoteVersionSync.tsx` | `"use cache"` 스코프에서 버전 태그를 달아 무효화 경로를 잇는다                           |

remote 를 향한 모든 HTTP 호출에는 `AbortSignal.timeout(REMOTE_FETCH_TIMEOUT_MS)` 가 걸린다.
remote 가 응답하지 않을 때 host 요청이 같이 멈추면 격리가 무의미해지기 때문이다.

## host 의 이중 로딩 경로

```ts
loadRemoteModule("cart/CheckoutFlow")
  │
  ├─ typeof window === "undefined"   →  loader/server.ts
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

| 모듈                    | 프로브         | 비고                                             |
| ----------------------- | -------------- | ------------------------------------------------ |
| `react`                 | `useState`     | 싱글턴 필수 — 어기면 `Invalid hook call`         |
| `react-dom`             | `createPortal` |                                                  |
| `react-dom/client`      | `createRoot`   | 빠지면 `Failed to bridge external shared module` |
| `react/jsx-runtime`     | `jsx`          |                                                  |
| `react/jsx-dev-runtime` | `jsxDEV`       | dev 전용 경로                                    |

넘기는 값은 `apps/host/src/mf/loader/react-modules.ts` 의 `normalizeModule(mod, probe)` 로 정규화한다.
`import * as X` 결과가 `{ default: {...} }` 로 오는 경우가 있어서다.

서버 쪽(`loader/server.ts`)은 MF shared 를 쓰지 않고 **require 셰임**으로 같은 4개를 주입한다.
remote 의 node 번들이 `require("react/jsx-runtime")` 를 그대로 호출하기 때문이다.

## MF 자동 타입(DTS)은 켜져 있다

두 remote 모두 `dts.generateTypes` 를 켜고, host 는 `pnpm mf:types` 로 받아간다.
받은 타입은 `packages/contracts/src/generated/` 에 **커밋된다** — `remote-contract.ts` 가
그 타입을 쓰기 때문이다.
그래서 `pnpm typecheck` 는 여전히 네트워크 0회다. 낡았는지는 CI 가 `git diff` 로 본다.

콘솔의 `[ dynamic-remote-type-hints-plugin ] err: [object Event]` 는 `dts` 가 아니라
`dev` 옵션 소관이라 `dev.disableDynamicRemoteTypeHints: true` 로만 끈다.

24차까지는 꺼져 있었고 근거는 "정보 중복" 이었다. 그 중복은 DTS 의 한계가 아니라
props 를 계약 패키지에 둔 결과였다 — 배치를 바꾸면서 판정도 뒤집혔다.
상세: [01-research/03-dts-plugin-review.md](../01-research/03-dts-plugin-review.md) 8절,
[ADR-019](./01-decision.md)

## 데이터 흐름 — 장바구니

```
catalog remote              cart remote                 cart remote
  "담기" 클릭                 CartBadge                   CheckoutFlow
      │                          ▲                            ▲
      ▼                          │ useStore(zustand/react)    │
  useCart((s) => s.add)(p) ──────┴────────────────────────────┘
  (@mfa/store)                     (@mfa/store)
      │
      ▼
  globalSingleton('cart', …)      ──persist 미들웨어──▶  document.cookie["mfa-cart"]
  (@mfa/store 내부 — zustand/vanilla createStore)          ▲ 최소 표현 [{id, q}]
                                                           │
                                            요청마다 실려 감 │
                                                           ▼
  host 서버   cookies() → parseCartCookie() ──initialLines props──▶ cart remote
```

- 전부 host 페이지 안이므로 **소프트 내비게이션 중 상태가 메모리에 그대로 남는다.**
- 쿠키는 새로고침 복원용이자 **서버가 읽을 수 있는 통로**다. 경계 통신 수단은 아니다 —
  remote 끼리는 여전히 메모리 안의 스토어 하나를 본다.
  (Multi-Zones 였다면 경계마다 왕복이 강제됐다)
- 저장하는 건 `[{id, q}]` 뿐이다. 이름·가격·이모지는 `findProduct` 로 복원한다 —
  쿠키는 요청마다 전송되고, 저장된 사본은 카탈로그가 바뀌면 낡는다.
- SSR 스냅샷은 여전히 빈 장바구니지만, **화면이 쓰는 값은 `initialLines` 다.**
  `useStore` 의 서버 스냅샷(`getInitialState()`)은 스토어 생성 시점에 캐시된 초기 상태라
  쿠키 복원값이 섞이지 않는다. 그래서 하이드레이션 커밋 전까지는 host 가 넘겨준
  `initialLines` 를 쓰고, 커밋 후 스토어로 넘어간다 — **둘 다 같은 쿠키에서 나오므로
  화면은 바뀌지 않는다**(ADR-014).
- 상태는 `lines` 하나뿐이다. 합계는 순수 함수 `cartTotals(lines)` 가 렌더 중에 계산한다.
- 구독할 조각은 호출부가 정한다 — `useCart((state) => state.lines)`.
  비교는 훅이 `shallow` 로 못 박는다(구현은 `useStoreWithEqualityFn`,
  `zustand/traditional`). zustand 기본값인 `Object.is` 를 그대로 뒀다면 객체를 돌려주는
  셀렉터마다 호출부가 비교 함수를 챙겨야 한다.
