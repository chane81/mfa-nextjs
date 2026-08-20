# 아키텍처 결정 기록 (ADR)

## ADR-001 — host 는 번들러 플러그인 없이 Module Federation 을 쓴다

- 상태: 채택 (2026-08-14)
- 맥락: Next.js 16 + Turbopack + App Router 를 유지하면서 MFA 를 구성해야 한다.
  `@module-federation/nextjs-mf` 는 사용 불가([근거](../01-research/01-nextjs-mf-eol.md)).
- 결정: host 에 **번들러 플러그인을 넣지 않는다.** `@module-federation/runtime` 을
  일반 라이브러리로 사용해 런타임에 remote 를 로드한다.
- 결과:
  - ⭕ Next.js 를 다운그레이드하지 않는다. `--webpack` 레거시 경로를 타지 않는다.
  - ⭕ remote 번들러가 자유로워진다(Vite / Rsbuild 혼용 검증됨).
  - ❌ remote 는 클라이언트 컴포넌트다. RSC 를 federate 할 수는 없다.

## ADR-002 — remote 를 웹/노드 두 타깃으로 빌드해 SSR 한다

- 상태: 채택 (2026-08-14, ADR-001 보강)
- 맥락: 초판은 remote 를 브라우저에서만 로드해 SSR 을 포기했다.
  **"remote 영역이 SSR 되어야 한다"** 가 요구사항으로 확정되면서 이 타협은 무효가 됐다.
- 대안 검토:
  - `@module-federation/node` → peer 가 `webpack ^5.40`. host 에 webpack 이 없어 부적합.
  - remote SSR HTML 을 fetch 해 주입(fragment/island) → 전송 채널이 둘로 늘고 props 가 직렬화에 묶임.
- 결정: remote 가 **node 타깃 CJS 번들(`mf-server.cjs`)** 을 추가로 배포하고,
  host 서버가 그걸 HTTP 로 받아 **자기 React 를 주입하며 평가**해 실제 React 트리에 렌더한다.
  `loadRemoteModule(id)` 하나가 `typeof window` 로 두 경로를 가른다.
- 결과:
  - ⭕ 초기 HTML 에 remote 마크업이 들어간다(검증됨).
  - ⭕ host 는 여전히 번들러 플러그인이 없다.
  - ❌ remote 빌드가 2벌이 된다.
  - ❌ host **서버**가 remote 코드를 실행한다 → origin 허용목록/무결성 검증 필요.
  - ❌ Node 런타임 전용(Edge 불가, `new Function` 평가 필요).
- 상세: [03-ssr-and-soft-nav.md](./03-ssr-and-soft-nav.md)

## ADR-003 — Multi-Zones 는 채택하지 않는다 (앱도 삭제)

- 상태: 기각 (2026-08-14)
- 맥락: 초판은 `/checkout` 을 별도 Next 앱(zone)으로 분리했다.
  **"하드 내비게이션이면 SPA 설계가 필요 없다"** 는 요구사항으로 이 방식은 탈락했다.
- 근거: zone 마다 Next 라우터가 따로 있어 경계 이동에 하드 내비게이션이 **강제**된다.
  측정값: `/` → `/legacy-checkout` document 요청 **1건**(하드),
  `/` → `/checkout`(remote) document 요청 **0건**(소프트).
- 결정: 결제 화면을 `cart` remote 의 `CheckoutFlow` 로 옮긴다.
  라우터는 host 하나만 둔다. zone 앱은 한동안 `/legacy-checkout` 에 대조군으로 뒀다가
  6차에서 삭제했다 — 결론이 확정된 뒤로는 유지 비용만 남았다.
- 결과:
  - ⭕ 전 구간 소프트 내비게이션.
  - ⭕ 런타임 상태 공유가 그대로 유지된다(localStorage 왕복 불필요).
  - ⚠️ 경로 단위로 팀이 완전히 갈리고 하드 내비가 허용되는 조직이라면 Multi-Zones 가 더 단순하다.

## ADR-004 — 공유 상태는 `globalThis` 싱글턴으로 잡는다

- 상태: 채택 (구현은 ADR-012 로 교체 — 싱글턴 결정 자체는 유효)
- 맥락: host, catalog(Vite), cart(Rsbuild)는 서로 다른 번들이다.
  `@mfa/contracts` 가 각 번들에 중복 포함되면 장바구니 상태가 갈라진다.
- 결정: 스토어 **인스턴스**를 realm 전역에 한 번만 심는다.
  MF `shared` 설정이 어긋나도 상태는 하나로 유지된다.
  (구현은 `packages/store/src/utils/global-singleton.ts` — `Symbol.for` 레지스트리 한 개)
- 결과:
  - ⭕ MF 설정 실수에 강건하다. Multi-Zones 쪽에서도 `localStorage` 로 이어진다.
  - ⭕ 구독 방식이 React 버전에 독립적이다.
  - ⚠️ 전역 네임스페이스 오염. 지금은 `Symbol.for('@mfa/store/singletons')` 레지스트리
    **하나**만 쓰고 도메인은 그 안의 이름으로 가른다 — 도메인마다 전역 키를 새로 파지 않는다.
  - ⚠️ 먼저 도착한 쪽이 이긴다. 두 번째 평가에서는 팩토리를 아예 부르지 않으므로,
    상태 모양을 바꾸는 배포는 remote 를 같이 올려야 안전하다.

## ADR-005 — React 는 host 가 remote 에 주입한다

- 상태: 채택
- 맥락: React 가 두 번 로드되면 훅이 깨진다(`Invalid hook call`).
- 결정: host 의 `init({ shared })` 에서 자기 React 인스턴스를 `lib: () => React` 로
  직접 넘긴다. `react`, `react-dom`, `react-dom/client`, `react/jsx-runtime`,
  `react/jsx-dev-runtime` 5개를 모두 등록한다.
- 결과: 브라우저에서 `window.__FEDERATION__.__SHARE__` 로 실제 공유 스코프를 확인 가능.
  검증 시 share scope 3개가 잡혔고 훅 오류 0건.

## ADR-006 — TypeScript 는 7 이 아니라 6.0.3 을 쓴다

- 상태: 채택 (제약사항)
- 맥락: 최신 TypeScript 는 **7.0.2**(네이티브 포팅 버전). 그러나
  `typescript-eslint@8.67.0` 의 peer 는 `typescript >=4.8.4 <6.1.0`.
- 결정: 지원 범위 내 최신인 **6.0.3** 을 고정한다.
- 재검토 시점: `typescript-eslint` 가 TS7 을 지원하면 즉시 7 로 올린다.
  (`npm view typescript-eslint peerDependencies` 로 확인)

## ADR-007 — 캐시는 `cacheComponents` 로 이행하고, remote 재배포는 태그로 깬다

- 상태: 채택 (2026-08-14 5차)
- 맥락: 초판은 remote 를 SSR 하는 페이지를 전부 `dynamic = "force-dynamic"` 으로 두어
  캐시를 통째로 껐다. "MFA 에서 ISR 이 되는가" 를 확인하려면 그 전제를 걷어내야 했다.
  게다가 Next 16 은 `cacheComponents` 를 켠 상태에서 `dynamic` / `revalidate` /
  `fetchCache` 세그먼트 설정을 **컴파일 에러로 거부한다.**
- 결정: host 전체를 `cacheComponents: true` 로 이행한다. 캐시를 끄는 대신
  `"use cache"` + `cacheLife` 로 캐시하고, remote 재배포를 `cacheTag` 무효화로 잇는다
  (`/api/mf-revalidate`).
- 결과:
  - ⭕ 캐시된 HTML 안에 remote 마크업이 들어간다. HIT 구간에는 remote 번들을 아예 안 건드린다.
  - ⭕ 독립 배포 전제가 "캐시 끔"이 아니라 "무효화 경로"로 유지된다.
  - ❌ 무효화 대상이 네 층(페이지 캐시 · 버전 캐시 · 번들 캐시 · 브라우저 MF 캐시)으로 늘었다.
  - ⚠️ 캐시 스코프 없이 프리렌더된 정적 라우트는 `cacheTag` 가 없어 별도 처리가 필요하다.
- 상세: [04-experiments/03-cache-modes.md](../04-experiments/03-cache-modes.md) ·
  [04-remote-lifecycle.md](./04-remote-lifecycle.md)

## ADR-008 — remote 배치 지식을 `@mfa/remote-config` 한 곳에 모은다

- 상태: 채택 (SSOT 2026-08-16 / 환경변수 통합 2026-08-18 7차)
- 맥락: "remote 가 몇 개이고, 어느 포트에 뜨고, 어떤 env 로 주소를 바꾸고, 어떤 파일명으로
  산출물을 내보내는가" 가 **아홉 군데**에 흩어져 있었다(host 런타임 · 서버 로더 · dev 대기
  스크립트 · 정적 서버 · stamp 스크립트 · Vite config · Rsbuild config · package.json 3개).
  하나만 고치면 증상이 제각각으로 나타난다 — 예: 포트만 바꾸면 dev 대기 스크립트가
  영영 안 뜨는 remote 를 60초 기다린다.
- 결정: 소비처 다섯 종류(node 스크립트 · 번들러 config · `next.config.ts` · Next 번들 ·
  워크스페이스 패키지)가 모두 읽을 수 있도록 **빌드 산출물 없는 패키지**로 만들고,
  `exports` 가 소스 `.ts` 를 직접 가리키게 한다. Node 24 타입 스트리핑이 이걸 실행한다.
- 함께 정한 것: **remote 주소 환경변수는 remote 당 하나**(`REMOTE_*_PUBLIC_URL`).
  예전에는 셋이었는데(브라우저 매니페스트 URL · SSR 번들 URL · 자산 오리진) 차이가
  오리진 뒤 파일명뿐이었고, 그 파일명은 이미 `MF_FILES` 에 있었다 — env 가 SSOT 를
  문자열로 복제하고 있던 셈이다.
- 결과:
  - ⭕ remote 추가/삭제 시 고칠 파일이 하나다. `satisfies` 가 누락을 컴파일 타임에 잡는다.
  - ⭕ host 코드에 remote 이름이 남지 않는다(`remote-endpoints.ts` 에 한 줄도 없다).
  - ❌ `engines.node >= 24.19.0` 이 하드 요구사항이 된다. 그 아래에서는 패키지가 로드조차 안 된다.
  - ⚠️ `docker-compose.yml` 만 예외다. 정적 YAML 이라 이 모듈을 읽을 수 없어 손으로 맞춘다.
- 상세: [03-setup/03-environment.md](../03-setup/03-environment.md)

## ADR-009 — 앱마다 별도 컨테이너로 배포한다 (Dokploy)

- 상태: 채택 (2026-08-15 6차)
- 맥락: "독립 배포"를 주장하려면 remote 만 재배포해도 host 가 안 죽는 걸 실제로 확인해야 한다.
  한 덩어리로 묶으면 그 검증 자체가 불가능하다.
- 결정: 세 앱이 각자 `Dockerfile` 을 갖고, Dokploy 에 **앱마다 별도 Application** 으로 올린다.
  host 는 `output: "standalone"` 산출물을 쓴다.
- 결과:
  - ⭕ remote 단독 재배포가 가능하다.
  - ❌ Dokploy 에 배포 후 훅이 없다. remote 재배포 → host 캐시 무효화는 GitHub Actions
    (`.github/workflows/mf-revalidate.yml`)가 대신한다 — 새 버전이 공표될 때까지 기다렸다
    host 에 알린다.
  - ❌ `outputFileTracingRoot` 를 저장소 루트로 올려야 한다(pnpm isolated 링커).
    `@swc/helpers` 의 `esm/` 누락은 `outputFileTracingIncludes` 로 따로 담는다.
- 상세: [03-setup/04-dokploy.md](../03-setup/04-dokploy.md)

## ADR-010 — Node 는 `>=24.19.0 <25` 로 고정한다

- 상태: 채택 (2026-08-19 9차)
- 맥락: ADR-008 이 Node 타입 스트리핑에 기대므로 버전이 곧 기능 요구사항이다. 그런데
  범위를 벗어난 Node 에서 pnpm 은 경고만 찍고 설치를 끝냈다(실측). 그러면 실패가 설치
  시점이 아니라 dev 서버나 프리렌더 한복판으로 밀리는데, 거기서 나오는 에러는 Node 버전을
  한 글자도 언급하지 않는다 — `SyntaxError: Missing initializer in const declaration` 이 전부다.
- 결정: `engines.node` 를 `>=24.19.0 <25` 로 두고 `pnpm-workspace.yaml` 에
  `engineStrict: true` 를 켠다. `.nvmrc` 도 같이 둔다.
- 결과:
  - ⭕ 안 맞으면 `pnpm install` 이 `ERR_PNPM_UNSUPPORTED_ENGINE` 으로 **먼저** 막는다.
  - ⭕ CI 도 같은 값을 쓴다(`pnpm/setup` 의 `runtime: node@^24.19.0`).
- 상세: [03-setup/02-versions.md](../03-setup/02-versions.md)

## ADR-011 — 스타일은 Tailwind v4 로 가고, host 가 remote CSS 주소를 건다

- 상태: 채택 (2026-08-19)
- 맥락: 초판은 `@mfa/ui` 의 인라인 스타일 토큰(`tokens.ts`)으로 스타일을 통일했다.
  CSS 파이프라인이 세 앱에서 제각각(Next/Turbopack · Vite · Rsbuild)이라 CSS 를
  아예 안 쓰는 쪽이 확실했기 때문이다. 지금은 세 번들러 모두 Tailwind v4 공식 연동이
  있어서 그 회피가 필요 없어졌다.
- 결정 ①: 토큰 원본을 `@mfa/tailwind-config` 의 `theme.css`(`@theme`)로 옮기고,
  **각 앱이 그 소스를 자기 파이프라인에서 컴파일한다.** 공유 CSS 를 한 번 빌드해
  배포하면 remote 가 새 클래스를 쓸 때마다 그 산출물을 다시 배포해야 하고,
  그러면 배포 단위가 다시 하나로 묶인다.
- 결정 ②: remote 의 CSS 는 host 가 **가져오지 않고 주소만 건다.** 파일명을 계약으로
  고정해(`style.css`) 주소를 계산으로 알아내고, `RemoteComponent` 가
  `<link rel="stylesheet" precedence>` 를 렌더하면 React 19 가 `<head>` 로 올리며 중복
  제거한다. MF 로 로드되는 모듈에는 번들러의 CSS 주입 런타임이 붙지 않고, SSR 번들은 아예
  CSS 를 실을 수 없어서 다른 경로가 없다.
- 결과:
  - ⭕ host 가 remote 매니페스트를 파싱하지 않는다 — 자산 구조에 묶이지 않는다.
  - ⭕ 토큰이 한 곳(`theme.css`)에서만 정의된다.
  - ⭕ 반복도 누락도 없다. remote 소비가 지나가는 자리가 `RemoteComponent` 하나뿐이라
    expose 를 추가할 때 잊을 여지가 없다.
  - ⭕ 페이지마다 실제로 쓰는 remote 의 CSS 만 실린다.
  - ❌ CSS 파일명에 해시를 못 붙인다(주소를 계산으로 알아야 하므로).
    캐시 무효화는 `/v<version>/` 불변 경로가 맡는다.
  - ❌ 오리진을 `publicOrigin` 으로 만들면 안 된다. 동적 env 접근이라 브라우저 번들에서
    치환되지 않아 배포에서 `localhost` 를 가리킨다 — `WEB_ENTRIES` 에서 뽑아야 한다.
  - ❌ Vite dev 는 CSS 를 JS 모듈로 서빙해서 `<link>` 가 조용히 무시된다 —
    `?direct` 로 순수 CSS 를 돌려주는 dev 전용 미들웨어가 필요했다.
- 상세: [02-topology.md](./02-topology.md) 의 "remote 의 CSS 는 어떻게 따라오나"

## ADR-012 — 장바구니 스토어는 zustand 로 갈아탄다 (싱글턴은 유지)

- 상태: 채택 (2026-08-19)
- 맥락: 스토어를 직접 구현했다. 리스너 Set, 스냅샷 재계산, localStorage 읽기·쓰기,
  `useSyncExternalStore` 배선까지 140줄이 전부 손으로 쓴 코드였다.
  MFA 실험에서 검증하려는 것은 **경계를 넘는 상태 공유**이지 스토어 구현이 아니다.
- 대안 검토:
  - 직접 구현 유지 → 의존성 0. 대신 미들웨어(persist·devtools)를 매번 손으로 짜야 한다.
  - Redux Toolkit → Provider 가 필요하다. host 트리에 Provider 를 두면 **remote 가
    host 의 React 트리 구조에 의존**하게 되어 독립 배포 전제가 약해진다.
  - Jotai / Valtio → 원자 단위 모델이 이 도메인(줄 목록 하나)에는 과하다.
  - **zustand** → Provider 가 필요 없다. `zustand/vanilla` 는 React 에 의존하지 않아
    contracts(프레임워크 무관 계약 패키지)에 그대로 들어간다.
- 결정: `zustand/vanilla` 의 `createStore` + `persist` 미들웨어로 바꾸고,
  **`packages/store`(`@mfa/store`) 로 분리한다**(배치 근거는 ADR-013).
  React 바인딩은 같은 패키지의 `/react` 서브패스에 둔다. **싱글턴 배치는 그대로다** —
  상태는 zustand 모듈이 아니라 스토어 인스턴스에 있으므로, 인스턴스를 globalThis 에
  심어야 번들이 갈려도 장바구니가 하나로 유지된다.
- 왜 zustand 를 MF `shared` 에 넣지 않았나: 넣을 이유가 없다. 스토어 API 는 평범한
  객체라 번들마다 zustand 사본이 달라도 상호운용된다. 공유해야 하는 것은 React 뿐이다(ADR-005).
- 결과:
  - ⭕ localStorage 배선이 `persist` 로 사라졌다. 스토어 파일이 절반 이하로 줄었다.
  - ⭕ 구독 범위를 셀렉터로 좁힐 수 있다 — `CartBadge` 는 합계만 구독한다.
  - ⭕ SSR 은 그대로 안전하다. `useStore` 의 서버 스냅샷이 `getInitialState()` 이고,
    그 값은 생성 시점에 캐시되므로 persist 복원값이 섞이지 않는다
    → `skipHydration` + 수동 `rehydrate()` 가 필요 없다.
  - ❌ 파생값(합계)을 상태에 두지 않으므로 셀렉터가 매번 새 객체를 만든다.
    zustand 5 의 기본 비교는 `Object.is` 라 그대로 두면 무한 렌더다 — 훅이
    `useStoreWithEqualityFn`(`zustand/traditional`) + `shallow`(`zustand/shallow`) 를 쓴다.
    이 훅도 서버 스냅샷으로 `getInitialState()` 를 넘기므로 hydration 안전성은 같다.
  - ❌ 의존성이 둘 늘었다. zustand 5.0.15, 그리고 `zustand/traditional` 이 optional peer 로
    요구하는 `use-sync-external-store` 1.6.0 — 둘 다 `@mfa/store` 한 곳만 가진다.

## ADR-013 — 런타임 공유 상태는 `packages/store` 가 소유한다

- 상태: 채택 (2026-08-19)
- 맥락: 장바구니 스토어가 `@mfa/contracts` 안에 있었다. 그런데 contracts 는 **타입 계약**
  패키지다 — remote 가 무엇을 노출하고 props 모양이 어떤지. 스토어는 **런타임 상태**다.
  성질이 다른 둘이 한 패키지에 있으면 타입만 필요한 소비처까지 zustand 와 DOM 타입을
  끌고 온다(실제로 contracts tsconfig 에 스토어 때문에 넣은 `lib: ["DOM", ...]` 이 있었다).
- 대안 검토:
  - **cart remote 가 소유** → 도메인 소유권으로는 가장 정직하다. 그러나 catalog remote 도
    스토어에 쓴다("담기" 버튼). 앱끼리 소스를 import 하면 독립 배포 전제가 깨지고,
    cart 가 스토어를 expose 하고 catalog 가 런타임에 로드하면 **remote → remote 의존**이
    생긴다 — 지금 규칙("remote 는 host 하고만 props·콜백으로 대화한다")을 정면으로 뒤집는다.
    이 전환은 catalog 의 props 계약(`onAddToCart`)과 host 배선까지 바꾸는 일이라 따로 다룬다.
  - `@mfa/ui` 가 소유 → ui 는 CSS 를 만들지 않는 프리젠테이션 패키지다. 상태를 넣으면
    비-React 소비처(standalone 셸)가 UI 패키지를 끌고 오게 된다.
  - contracts 유지 → 위 맥락 그대로.
- 결정: `packages/store`(`@mfa/store`) 신설. **도메인별 폴더**로 나누되 진입점은 하나다.
  각 도메인이 자기 공개 표면을 `<도메인>/index.ts` 에 정하고, 루트 배럴이 그걸 모은다.

  ```
  src/cart/create-store.ts       스토어 + globalSingleton + useCart ('use client')
  src/cart/totals.ts             cartTotals — 셀렉터가 아닌 순수 함수
  src/cart/index.ts              도메인 공개 표면
  src/hooks/use-hydrated.ts      useHydrated — 도메인 무관 훅 (13차)
  src/hooks/index.ts             공개 표면
  src/utils/global-singleton.ts  (내부)  번들 경계를 넘는 인스턴스 1개 보장
  src/index.ts                   → "@mfa/store"  도메인 index 들을 모은다
  ```

  **`hooks/` 는 도메인이 아니다.** 도메인 폴더가 "무슨 상태인가"를 담는다면 여기는
  "React 와 어떻게 맞물리는가"를 담는다. `useHydrated` 는 장바구니를 모르고 zustand 도
  참조하지 않는다 — 브라우저에만 있는 값을 화면에 쓰는 자리는 전부 같은 경계를 갖기 때문에
  도메인 폴더에 두면 다음 소비처가 `cart` 를 import 하게 된다.

  상대 경로에 **확장자를 붙이지 않는다**(이 패키지에서 시작해 저장소 전역으로 맞췄다).
  모든 소비가 번들러를 거치기 때문이다. 대가는 dist 를 raw Node 로 직접 못 연다는 것이고,
  예외(`@mfa/remote-config`)와 재발 조건은
  [D-1](../05-troubleshooting/01-known-issues.md#d-1-확장자-없는-상대-경로는-번들러에서만-풀린다).

  **밖으로 나가는 것은 훅 하나와 순수 함수 하나, 그리고 타입이다.**

  ```ts
  useCart(selector); // 스토어에 묶인 훅. 무엇을 구독할지는 호출부가 정한다
  cartTotals(lines); // 합계 계산. 셀렉터가 아니라 평범한 순수 함수
  ```

  **비교 함수는 스토어가 못 박는다.** `createWithEqualityFn`(`zustand/traditional`)의
  두 번째 인자로 `shallow` 를 기본값으로 준다. `create` 는 비교가 `Object.is` 로 고정이라
  새 객체를 돌려주는 셀렉터(`(state) => ({ clear, setQuantity })`)가 매 렌더 다르다고
  판정되어 무한 렌더로 간다 — 그 규칙이 화면으로 새지 않게 하려는 것이다.

  스토어 인스턴스(`cartStore`)와 팩토리는 내보내지 않는다 — 인스턴스를 공개하면
  "어디서든 `getState()` 로 건드릴 수 있는 전역"이 하나 더 생긴다.

  **셀렉터를 패키지에 미리 정의하지 않는다.** 화면마다 필요한 조각이 다르고, 미리 정의하면
  쓰지도 않는 조합이 공개 API 로 굳는다. 합계만 순수 함수로 뺐다 — 상태의 조각이 아니라
  화면이 쓰는 계산값이라 구독·비교와 얽힐 이유가 없다.

  `utils/` 도 진입점이 없다. 새 도메인은 `globalSingleton('auth', createAuthStore)` 로
  같은 장치를 재사용하고, `src/index.ts` 에 자기 index 한 줄을 더한다.

  ⚠️ 대가: 배럴 하나라 도메인이 늘면 `@mfa/store` 를 쓰는 쪽이 안 쓰는 도메인 모듈까지
  그래프에 들인다. 번들러 tree-shaking 이 걷어내지만, 도메인이 많아지면 도메인별
  서브패스(`@mfa/store/cart`)로 되돌리는 편이 낫다 — `exports` 한 줄이면 된다.

  react 는 peerDependency. 다음 도메인(인증 토큰 등)은 `src/auth/` 로 같은 모양을 반복한다.

- 결과:
  - ⭕ contracts 는 다시 타입만 남았다. DOM lib 오버라이드와 zustand 의존이 빠졌다.
  - ⭕ `@mfa/ui` 는 의존성이 0 이 됐다(cart 훅이 나가면서 contracts·zustand 둘 다 빠짐).
  - ⭕ 상태를 더 만들 자리가 생겼다(인증 토큰 등 — `docs/00-progress.md` 의 남은 항목).
  - ⚠️ 여전히 "어느 remote 도 소유하지 않는" 상태다([ADR-004](#adr-004--공유-상태는-globalthis-싱글턴으로-잡는다)).
    cart remote 소유로 옮기는 안은 위 대안에 기록해 뒀다.
- API 표면을 한 번 깎았다. 처음엔 편의 래퍼가 셋 있었는데 전부 지웠다.
  - `cartActions` (React 밖 호출용 래퍼) → 소비처가 전부 컴포넌트라
    `useCart((state) => state.add)` 면 된다. 스토어 인스턴스를 공개하지 않아도 되는 이유다.
  - 화면별 훅(`useCartLines` · `useCartTotals` · `useCartActions`) → `useCart` 하나로 합쳤다.
    구독 범위를 정하는 주체는 스토어가 아니라 그 화면이다.
  - `selectTotals` + 참조 1칸 캐시 → `shallow` 비교 함수로 대체. 손으로 짠 캐시가 사라졌다.
  - `getCartStore()` → `cartStore` 모듈 상수. 호출부에서 함수 호출이 한 겹 빠진다.
- **전역 레지스트리 조회는 지우지 않았다.** 훅에서 `createCartStore()` 를 바로 부르면
  번들마다(host · catalog · cart) 인스턴스가 따로 생겨 장바구니가 갈라진다. 증상은
  "catalog 에서 담았는데 cart 배지가 0" 이고, 빌드·타입체크는 전부 통과한다.
  `createCartStore()` 는 export 로 남겨 뒀지만 용도는 테스트 격리다.

## ADR-014 — 하이드레이션 구간은 감추지 않고 전환 애니메이션으로 쓴다

- 상태: 채택 (2026-08-20)
- 맥락: 새로고침하면 헤더 배지와 장바구니 패널이 한 번 깜빡였다. 처음엔 localStorage 가
  느린 줄 알았는데 아니었다. zustand 의 persist 는 동기 저장소면 **스토어 생성 시점에
  이미 복원을 끝낸다**(5.0.15 문서: "With synchronous hydration, the Zustand store will
  already have been hydrated at its creation"). 늦는 건 React 다 — `useStore` 는
  하이드레이션 렌더에서 서버 스냅샷(`getInitialState()` = 빈 장바구니)을 쓴다.
  서버 HTML 과 첫 클라이언트 렌더가 같아야 하기 때문이고, 이건 ADR-012 가 "SSR 은 그대로
  안전하다"고 적은 바로 그 성질이다. **안전성의 대가가 깜빡임으로 보인 것**이다.
  CDP 로 rAF 마다 표본을 뜬 결과 커밋은 로드 후 35~60ms, 그 한 프레임에 배지 폭이
  130 → 188px, 패널 본문이 0 → 206px 로 **순간이동**한다. 이 층 이동이 깜빡임의 정체다.
- 대안 검토:
  - **자리표시자로 가린다** → 먼저 해 봤고 더 나빴다. 그 구간은 3프레임이라 회색 상자가
    "로딩 중"이 아니라 번쩍임으로 읽힌다. 게다가 줄 수를 서버도 첫 렌더도 모르니
    자리 크기를 실제와 맞출 수 없어 층 이동이 그대로 남는다.
  - **쿠키로 옮긴다** → 서버가 장바구니를 알게 되니 구간 자체가 사라진다. 대신 `cookies()`
    를 읽는 라우트는 프리렌더를 잃고, 저장 위치가 요청마다 네트워크로 오가며,
    "브라우저 안에서만 사는 상태"라는 이 실험의 전제도 바뀐다. 한 프레임 대가로는 과하다.
  - **`skipHydration` + 수동 `rehydrate()`** → 구간을 없애는 게 아니라 **늘린다**.
    복원이 effect 로 밀리므로 커밋이 한 프레임 더 뒤로 간다.
- 결정: 구간을 없애려 하지 않는다. **그 구간을 전환 구간으로 쓴다.**
  `useHydrated()` 가 하이드레이션 커밋 경계(서버·첫 렌더 `false` → 커밋 후 `true`)를
  노출하고, cart remote 의 CSS 가 그 경계에서 높이·값 전환을 건다.

  ```
  하이드레이션 전   상자 전체가 흐리다(blur 4px). 목록은 접힌 채(높이 0),
                    빈 장바구니 문구도 아직 안 띄운다
  커밋              흐림이 풀리며 또렷해지고, 0fr → 1fr 로 펼쳐진다.
                    줄은 45ms 간격으로 들어오고 배지는 가로로 펼쳐진다
  ```

  전환에 그리드를 쓰는 이유는 `height: auto` · `width: auto` 에 transition 이 안 걸려서다.
  `0fr → 1fr` 은 내용 크기를 미리 알 필요가 없는 유일한 방법이고, 세로(`grid-template-rows`)와
  가로(`grid-template-columns`) 양쪽에 같은 장치를 쓴다 — 배지는 폭이, 패널은 높이가 튄다.

  **CSS 파일에는 유틸리티로 못 적는 것만 둔다.** 크기 전환은
  `grid-rows-[0fr]` / `data-[open=true]:grid-rows-[1fr]`, 흐림은 `blur-xs`,
  자식 지정은 `*:overflow-hidden`, 움직임 줄이기는 `motion-reduce:` 로 전부 유틸리티다.
  CSS 로 내려보내면 그 규칙이 마크업에서 안 보이게 된다. 정말 못 적는 건 **키프레임**뿐이라
  `@theme` 안에 `--animate-cart-line` · `--animate-cart-pop` 으로 등록한다(v4 규약).
  곡선은 `--ease-reveal` 토큰으로 `theme.css` 에 둔다 — 배지·목록·흐림이 **같은 곡선**을
  타야 하나의 동작으로 읽히고, 그건 색과 마찬가지로 토큰이 지킬 일이다.
  반복되는 유틸리티 조합은 CSS 클래스가 아니라 컴포넌트(`Reveal`)로 묶는다.

  하이드레이션 전에 **"담긴 상품이 없습니다"를 띄우지 않는 것**이 이 결정의 핵심이다.
  띄우면 장바구니가 비어 있지 않은 사람에게 사실이 아닌 문장을 한 프레임 보여 줬다 접게 된다.
  접힌 상태에서 시작하면 층 이동이 한 방향으로만 일어나고, 그건 깜빡임이 아니라 등장이다.

  **접히지 않는 자리는 상자 단위로 흐리게 둔다.** 목록은 접혀도 합계 줄은 남으므로
  `0개 · 합계 0원` 이 한 프레임 노출된다. 그 자리만 또 가리면 장치가 계속 늘어나니,
  패널 전체에 `opacity: 0.5` + `filter: blur(4px)`(Tailwind v4 의 `blur-xs` 와 같은 값)를
  걸고 확정되는 순간 푼다. 값이 바뀌는 걸 감추는 게 아니라 **"아직 확정 전"을 상태로
  보여주는 것**이라, 사라졌다 나타나는 대신 초점이 맞는 동작이 맞다.

- 결과:
  - ⭕ 서버가 장바구니를 모른다는 전제가 그대로다. 프리렌더도, 쿠키도, 새 왕복도 없다.
  - ⭕ 빈 장바구니는 바뀌는 값이 없으니 아무 애니메이션도 돌지 않는다.
  - ⭕ 소프트 내비게이션으로 들어오면 이미 `true` 라 펼친 상태로 마운트된다.
  - ❌ 전체 등장이 300ms 라 한 프레임보다 **길다**. 짧게 튀는 것보다 길게 이어지는 편이
    읽기 쉽다는 판단이고, 이건 취향이 아니라 눈이 움직임을 추적할 수 있느냐의 문제다.
  - ⭕ 새 CSS 클래스가 없다. cart remote 의 CSS 에 늘어난 것은 키프레임 둘과 그 등록뿐이고,
    공유 토큰은 `--ease-reveal` 하나다. 나머지는 전부 마크업의 유틸리티에 적혀 있다.
  - ❌ `Reveal` 컴포넌트가 하나 늘었다. 유틸리티 조합이 네 자리에 복제되는 걸 막으려는 것이고,
    감싸는 `<div>` 두 겹(그리드 상자 + `overflow-hidden` 자식)은 이 기법의 고정 비용이다.
  - 실측: 배지 97.8 → 187.6px, 패널 본문 0 → 206.5px, 흐림 4px → 0, 불투명도 0.5 → 1 —
    전부 같은 300ms 곡선에 실린다(10ms 시작, 318ms `filter: none`).
  - ⚠️ `prefers-reduced-motion: reduce` 면 전환 없이 최종 상태만 준다.

## 경계 설계 원칙

| 책임                  | 소유자                          | 이유                                                       |
| --------------------- | ------------------------------- | ---------------------------------------------------------- |
| 라우팅                | host                            | remote 에 `next/link` 를 강요하면 프레임워크 종속이 생긴다 |
| 레이아웃 · 헤더       | host                            | 셸은 하나여야 한다                                         |
| 상품 목록/상세 렌더링 | catalog remote                  | 도메인 소유 팀이 UI 를 통째로 배포                         |
| 장바구니 UI           | cart remote                     | 위와 동일                                                  |
| 장바구니 상태         | `@mfa/contracts` zustand 싱글턴 | 어느 쪽도 소유하지 않는 공유 계약                          |
| 결제 플로우           | cart remote (`CheckoutFlow`)    | 라우터를 host 하나로 유지해야 소프트 내비게이션이 된다     |

remote 는 **props 와 콜백으로만** host 와 대화한다.
`onSelect(product)` → host 가 `router.push` 를 수행. remote 는 라우터를 모른다.
이 규칙 덕분에 remote 를 어느 라우트로 옮겨도 소프트 내비게이션이 유지된다.
