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
  src/utils/global-singleton.ts  (내부)  번들 경계를 넘는 인스턴스 1개 보장
  src/index.ts                   → "@mfa/store"  도메인 index 들을 모은다
  ```

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

## ADR-014 — 장바구니 저장소를 쿠키로 옮긴다

- 상태: 채택 (2026-08-20)
- 맥락: 새로고침하면 헤더 배지와 장바구니 패널이 한 번 깜빡였다. 원인은 저장소가 느려서가
  아니다. zustand 의 persist 는 동기 저장소면 **스토어 생성 시점에 복원을 끝낸다**
  (5.0.15 문서: "With synchronous hydration, the Zustand store will already have been
  hydrated at its creation"). 늦는 건 React 다 — `useStore` 는 하이드레이션 렌더에서
  서버 스냅샷(`getInitialState()` = 빈 장바구니)을 쓴다. ADR-012 가 "SSR 은 그대로
  안전하다"고 적은 바로 그 성질이고, **안전성의 대가가 깜빡임으로 보인 것**이다.
  CDP 로 rAF 마다 표본을 뜨면 한 프레임에 배지 폭이 97.8 → 187.6px, 패널 본문이
  0 → 206.5px 로 순간이동한다. 이 층 이동이 깜빡임의 정체다.

  **근본 원인은 저장 위치다.** localStorage 는 브라우저에만 있어 서버가 장바구니를
  모른다. 서버가 모르면 첫 HTML 은 반드시 비어 있고, 전이는 없앨 수 없다.

- 대안 검토:
  - **자리표시자로 가린다** → 두 번 해 봤고 둘 다 더 나빴다. 한 프레임짜리에 로딩 UI 를
    붙이면 번쩍임이 되고, **줄 수를 서버도 첫 렌더도 모르니** 자리 크기를 실제와 맞추는
    게 원리상 불가능하다 — 층 이동이 그대로 남는다.
  - **전환 애니메이션으로 쓴다** → 구간을 없애지 않고 이어서 움직이게 만든다. 깜빡임은
    사라지지만 **여전히 첫 화면이 틀린 값**이고, 정착까지 300ms 가 걸린다.
  - **`skipHydration` + 수동 `rehydrate()`** → 구간을 없애는 게 아니라 늘린다.
    복원이 effect 로 밀려 커밋이 한 프레임 더 뒤로 간다.
  - **서버 세션 / DB** → 서버가 알게 되지만 로그인 개념과 저장소가 필요하다.
    이 저장소의 범위를 넘고, 검증하려는 것(MF 런타임 소비)과도 무관하다.
- 결정: **저장소를 쿠키로 옮긴다.** 쿠키는 요청에 실려 가므로 서버가 읽을 수 있다.

  ```
  브라우저   zustand persist ──▶ document.cookie["mfa-cart"] = [{id, q}]
                                        │ 요청마다 전송
  서버       cookies() → parseCartCookie() ──initialLines props──▶ cart remote
  ```

  - **담는 것은 `[{id, q}]` 뿐이다.** 쿠키는 요청마다 전송되고, 한글 상품명은 URL 인코딩되면
    글자당 9바이트다. 이름·가격·이모지는 `findProduct` 로 복원한다 — 카탈로그가 바뀌어도
    저장된 사본이 낡지 않는다는 부수 효과가 있다.
  - **포맷의 원본은 한 곳이다.** 서버(host)와 브라우저(store)가 같은 규칙을
    봐야 하는 값이라 계약 쪽에 둔다. `CartLine` 도 같은 이유로 여기로 옮겼다 —
    이제 remote props(`initialLines`)에 나타나는 타입이다.
  - **하이드레이션 렌더까지는 `initialLines`, 커밋 후에는 스토어.** 스토어의 서버 스냅샷은
    여전히 빈 장바구니이므로 그대로 쓰면 첫 HTML 이 비어 버린다. 경계는 `useHydrated()` 가
    노출한다. **둘 다 같은 쿠키에서 나오므로 화면은 바뀌지 않는다**(단일 탭 기준. 서버가
    응답을 보내는 사이 다른 탭이 쿠키를 바꾸면 그 한 번은 갈리고, 포커스가 돌아올 때
    `useCartSync` 가 수렴시킨다) — localStorage 시절과
    결정적으로 다른 점이다.
  - **쿠키 이름은 `mfa-cart` 다.** RFC 6265 에서 `:` 는 구분자라 쿠키 이름에 못 쓴다.
    옛 localStorage 키(`mfa-nextjs:cart`)와 이름이 달라 옛 값은 딸려오지 않는다 —
    저장 매체가 바뀌었으니 그게 맞다.
  - `SameSite=Lax` 다(값을 안 적어도 브라우저 기본이라, 적는 건 의도를 남기는 것이다).
    `Strict` 가 추가로 막는 건 "크로스사이트 최상위 GET 이동에 쿠키가 실림" 하나인데,
    이 쿠키로 서버가 하는 일은 **읽어서 렌더**뿐이라 얻는 게 없다. 반면 **재방문자가
    외부 링크로 들어오는 경우** 쿠키가 실리지 않아 그 화면만 빈 장바구니가 된다 —
    없애려던 증상이 그 진입에서만 돌아온다. 진짜 첫 방문이면 쿠키가 없으니 둘이 같고,
    주소창·북마크는 개시 사이트가 없어 `Strict` 여도 실린다.

- 어디서 읽느냐가 캐시를 결정한다:

  | 부르는 자리                 | 셸 프리렌더 | 첫 페인트에 장바구니 |
  | --------------------------- | ----------- | -------------------- |
  | 페이지 본문 (Suspense 밖)   | ❌          | ⭕                   |
  | `<Suspense>` 안 (헤더 슬롯) | ⭕          | 헤더 도착 시점       |

  장바구니가 본문인 `/`·`/cart`·`/checkout` 은 첫 줄을 고른다. 레이아웃(헤더)은 두 번째
  줄이다 — 레이아웃에서 Suspense 밖으로 읽으면 **모든 라우트**가 프리렌더에서 빠져
  `/lab` 의 캐시 실험까지 죽는다. 헤더는 `usePathname` 때문에 원래도 그 경계 뒤로
  스트리밍되므로 새로 생기는 지연이 없다.

  `cacheComponents` 는 모든 페이지가 비어 있지 않은 정적 셸을 만드는지 검증하므로,
  첫 줄을 고른 세 라우트는 `export const instant = false` 로 그 검증에서 빠져야 한다
  (Next 16 의 공식 통로). 루트 레이아웃이 아니라 **그 페이지에만** 건다.

- 쿠키 배관과 도메인 설정을 가른다. `utils/cookie-storage` 가 `createCookieStorage()` 로
  읽기 · 쓰기 · 속성 조립 · persist 봉투를 맡고, `cart/cookie-storage` 는 **설정만** 남긴다.
  `secure` 는 기본값이 현재 스킴을 따른다. dev(http)에서 켜면 쿠키가 저장조차 안 되고
  실험 전체가 조용히 망가진다.

- **두 층을 헷갈리지 않는다 — 값의 표현과 전송 인코딩은 다른 것이다.**

  | 층          | 무엇             | 어디                             | 왜 거기                                    |
  | ----------- | ---------------- | -------------------------------- | ------------------------------------------ |
  | 값의 표현   | `[{id, q}]` JSON | `@mfa/store` `cart/cookie-codec` | **서버도 같은 규칙을 봐야 한다** (ADR-015) |
  | 전송 인코딩 | 퍼센트 인코딩    | `utils/cookie-storage`           | 매체마다 벗기는 주체가 다르다              |

  전송 인코딩을 계약 쪽에 두면 **서버만 두 번 벗긴다.** 서버는 Next 의 `cookies()` 가
  이미 디코딩해서 주고(`@edge-runtime/cookies` 의 `parseCookie` 가 `decodeURIComponent`
  를 부른다), 브라우저는 `document.cookie` 원문을 받는다. 같은 파서를 양쪽에 쓰면서
  그 안에서 디코딩하면 서버 경로만 한 층 더 벗겨진다.

  값에 `%` 가 없는 동안은 아무 일도 안 일어난다 — 상품 식별자가 `kb-001` 이고 수량이
  숫자라 지금이 그렇다. 그래서 **조용하고, 그래서 나쁘다.** 저장 표현에 필드가 하나
  늘거나 `%` 가 낀 식별자가 생기는 순간 서버는 `URIError` 로 빈 장바구니가 되고
  브라우저는 멀쩡히 파싱한다. 첫 HTML 과 하이드레이션이 갈라지는 것 —
  **이 ADR 이 없애려는 깜빡임이 정확히 그 모양이다.**

  그래서 벗기는 자리를 매체 쪽에 둔다. `readCookie` 가 디코딩까지 해서 주고,
  `parseCartCookie` 는 **항상 디코딩된 문자열**을 받는다. 쓰는 쪽도 대칭이다 —
  `serializeCartCookie` 는 평문 JSON 을 돌려주고 `setItem` 이 인코딩을 씌운다.
  바이트로 나가는 결과는 이전과 같아서 이미 저장된 쿠키는 그대로 읽힌다.

- **쿠키는 신뢰 경계다.** 사용자가 고칠 수 있는 입력이므로 `fromStoredLines` 가 세 가지를
  강제한다 — 모르는 식별자는 버리고, 같은 상품 두 줄은 **한 줄로 합치고**, 수량은
  `MAX_CART_QUANTITY` 로 자른다.

  가격 변조는 애초에 막혀 있다(이름 · 가격 · 이모지를 카탈로그에서 복원하므로). 남는 건
  정합성이다. 중복 줄은 화면이 같은 React key 를 두 번 쓰게 만들고 `setQuantity` ·
  `remove` 가 두 줄을 동시에 건드린다. 수량은 `q: 1e308` 이 `Number.isFinite` 를 통과해
  `unitPrice * quantity` 에서 `Infinity` 가 되고 `∞원` 이 찍힌다.

- **쿠키 쓰기 실패는 예외로 오지 않는다.** `document.cookie = ...` 는 크기 초과 ·
  브라우저의 쿠키 차단 · 정책 거부에서 전부 조용히 실패한다. 실패하면 화면의 스토어만
  바뀌고 쿠키는 옛 값에 머무는데, 그 상태로 새로고침하면 **서버가 옛 장바구니를 렌더한다** —
  없애려던 불일치가 그 모양으로 돌아온다. 그래서 4096바이트 예산을 미리 재고, 쓴 뒤
  되읽어 확인한다. dev 에서만 경고하고 던지지는 않는다(저장 실패로 화면이 죽는 쪽이 나쁘다).

- **탭 사이 동기화는 포커스 복귀 시점에 한다**(`useCartSync`). 각 탭은 로드 때 쿠키를 한 번
  읽고 메모리 상태를 쥐므로, 탭 A 가 담은 뒤 탭 B 에서 수량을 바꾸면 B 의 낡은 전체 상태가
  쿠키를 덮어써 A 의 변경이 사라진다. localStorage 시절에도 같았지만 성질이 바뀌었다 —
  이제 서버가 요청마다 맞는 값을 `initialLines` 로 내려보내는데 `useHydrated` 가 커밋 후
  `true` 로 고정이라 클라이언트가 그걸 계속 버린다.

  `storage` 이벤트는 localStorage 전용이라 쿠키에 발화하지 않고, `cookieStore.onchange` 는
  Chromium 계열 전용이다. 남는 이식성 있는 경로가 포커스 복귀 시 재읽기다. 원문이 바뀌었을
  때만 `rehydrate()` 를 불러 불필요한 리렌더를 막는다. 실시간은 아니다 — **사용자가 그 탭을
  보는 순간에는 맞는 값**이라는 게 보장의 전부고, 덮어쓰기를 막는 데는 그걸로 충분하다.

- persist 의 `version` · `migrate` 는 쓰지 않는다. 쿠키에는 버전이 없어서 봉투에 실을 값이
  **항상 현재 버전**이 되고, 그러면 비교가 영원히 일치해 `migrate` 가 발화할 수 없다.
  persist 는 봉투의 `version` 이 숫자일 때만 비교하므로(zustand 5.0.15 소스) 빼두면
  저장된 상태를 그대로 쓴다. 저장 표현이 바뀌면 원문 문자열을 보는 유일한 자리인
  `parseCartCookie` 가 옛 모양을 알아본다 — 동작하지 않는 장치를 배선된 척 남기지 않는다.
- 쿠키 어댑터는 직접 구현한다(조사 후 판단):
  - zustand 문서가 제시하는 표준이 **어댑터 직접 구현**이다 — IndexedDB·URL 쿼리 예제 모두
    `StateStorage` 를 손으로 쓴다.
  - `zustand-cookie-storage`(유일한 zustand 전용 패키지)는 **기능상 못 쓴다.** 상태를 잎
    노드마다 쿠키 하나씩 쪼개고 중첩 경로를 쿠키 *이름*에 인코딩한다. 서버가 읽으려면 그
    복원 로직을 재구현해야 하는데, 서버가 읽는 게 이 변경의 전부다. `sameSite` 옵션도 없다.
  - 범용 라이브러리(`js-cookie`·`cookie-es`·`cookie`)가 대체하는 건 **9줄**이다.
    나머지는 포맷 변환이라 남는다. 그 대가로 `@mfa/store` 에 첫 외부 의존성이 생기고,
    이 패키지는 host·catalog·cart 가 각자 번들하며 remote 는 웹·SSR 양쪽에 싣는다.
  - 플랫폼 표준 `cookieStore` API 는 **비동기**라 배제된다 — 동기 복원이 설계의 전제다.
- 결과:
  - ⭕ **전이가 사라졌다.** rAF 91프레임 전부 같은 값이다 — 첫 프레임(5.5ms)에 이미
    배지 188.4px, 패널 366.5px, 3줄. 고치기 전에는 한 프레임에 두 자리가 튀었다.
  - ⭕ 첫 HTML 에 장바구니가 들어간다. JS 를 끄거나 느린 회선에서도 값이 맞는다.
  - ❌ `/`·`/cart`·`/checkout` 이 정적 프리렌더(`○`)에서 요청 시 렌더(`ƒ`)로 내려갔다.
    나머지 라우트는 `○` → `◐` 다 — 레이아웃 헤더가 쿠키를 읽으므로 셸은 프리렌더되고
    헤더만 스트리밍된다. `/lab` 의 캐시 실험은 그대로 산다.
  - ❌ 요청마다 쿠키가 전송된다. 세 줄이면 100바이트 남짓이지만 공짜는 아니다.
    최소 표현을 고른 이유가 이것이다.
  - ~~❌ `@mfa/contracts` 가 장바구니 포맷을 알게 됐다.~~ **ADR-015 에서 해소.**
    "다른 자리가 없다"고 적었지만 틀렸다 — "서버와 브라우저가 같은 규칙을 본다"는
    _어느_ 공유 패키지에 두든 성립하므로 자리를 고르는 근거가 못 된다. 코덱은
    `@mfa/store` 의 `cart/cookie-codec` 으로 옮겼고 contracts 에는 `CartLine` 만 남았다.
  - ⚠️ 쿠키는 사용자가 고칠 수 있다. `parseCartCookie` 는 어떤 입력에도 던지지 않고,
    모르는 상품 식별자는 조용히 버린다 — 한 줄 때문에 장바구니 전체를 잃는 쪽이 나쁘다.

## ADR-015 — 장바구니 쿠키 코덱은 `@mfa/store` 가 소유하고, 전용 진입점으로만 나간다

- 상태: 채택 (2026-08-20)
- 맥락: ADR-014 가 쿠키 코덱(`parseCartCookie` · `serializeCartCookie` · `fromStoredLines`
  · 쿠키 상수)을 `@mfa/contracts` 에 뒀다. 근거로 적은 문장은 "서버와 브라우저가 같은
  규칙을 봐야 한다"였는데, **그건 어느 공유 패키지에 두든 똑같이 성립한다** — 자리를
  고르는 근거가 아니었다.

  contracts 가 담는 건 **host ↔ remote 의 props 계약**이다(ADR-013). 코덱이 넘는 경계는
  거기가 아니다 — **host(서버) ↔ `@mfa/store`(브라우저)** 고, `remote-cart` 는 이 함수들을
  하나도 부르지 않는다(확인함). 받는 건 `CartLine` 뿐이고 그건 props 로 온다.

- 결정: 코덱을 `packages/store/src/cart/cookie-codec.ts` 로 옮긴다. `CartLine` 은
  contracts 에 남는다 — `CartPanelProps` 등의 `initialLines` 가 그 타입이라 **진짜**
  props 계약이다.

  자리의 근거는 **가까움**이다. 쿠키에 무엇을 담을지(`cookie-codec`), 어떤 속성으로
  쓸지(`cookie-storage`), 어떻게 상태가 되는지(`create-store`), 합계는 어떻게 내는지
  (`totals`)가 한 폴더에 모인다. 저장 표현을 바꾸는 변경은 이 넷을 같이 건드리는데,
  하나만 다른 패키지에 있으면 매번 두 곳을 오간다.

- **⚠️ 루트 진입점으로 내보내면 안 된다 — 실측으로 확인했다.**

  처음에는 `cart/index.ts` 배럴에 코덱을 얹고 host 가 `@mfa/store` 에서 꺼내게 했다.
  `create-store.ts` 에 `'use client'` 가 붙어 있으니 Next 가 서버 그래프에서 클라이언트
  참조로 바꿔 평가하지 않을 것이고, 따라서 안전하다고 봤다. **평가는 안 됐지만 번들에는
  실렸다.**

  | 확인한 것                             | 결과                                           |
  | ------------------------------------- | ---------------------------------------------- |
  | host 브라우저 번들에 zustand + 스토어 | 실렸다 — 21.8KB, gzip 9.1KB                    |
  | 그 청크를 참조하는 페이지             | `_not-found` · `debug` · `lab` — 장바구니 없음 |
  | host 가 스토어를 쓰는가               | 안 쓴다. `useCart` 호출 0회                    |

  배럴이 `'use client'` 모듈을 재수출하면, 그 배럴을 타는 순간 클라이언트 그래프 전체가
  딸려온다. 서버에서 평가되지 않는 것과 브라우저로 전송되지 않는 것은 **다른 얘기**다.

- 결정 2: **진입점은 하나로 두고 `react-server` 조건으로 가른다.**

  처음엔 전용 서브패스(`@mfa/store/cart-cookie`)를 냈다. 동작은 했지만 **이름을 지어낸
  것**이라 확장이 안 된다 — 도메인이 열이면 지어낸 이름이 열이 되고, 무엇이 어느 파일인지
  `package.json` 을 봐야 안다.

  표준 통로가 따로 있다. React 서버 컴포넌트 규약의 `react-server` export 조건이다.
  React 자신이 그걸 쓴다.

  ```jsonc
  // packages/store/package.json — 진입점은 여전히 하나(".")다
  "exports": {
    ".": {
      "react-server": { "types": "./dist/server.d.ts", "default": "./dist/server.js" },
      "types":  "./dist/index.d.ts",
      "default": "./dist/index.js"
    }
  }
  ```

  ```
  src/index.ts    브라우저 표면 — 도메인 배럴을 모은다 ('use client' 포함)
  src/server.ts   서버(RSC) 표면 — 순수 모듈만 직접 집는다
  ```

  소비처는 **양쪽 다 `@mfa/store` 로 부른다.** 어느 표면을 받을지는 번들러가 정한다.
  ADR-013 의 "진입점은 하나다" 가 그대로 산다.

- **대조 실험으로 확인했다** (Next 16.3.1 / Turbopack). 같은 코드, 조건 한 줄 차이:

  | `react-server` 조건 | host 브라우저 번들                  |
  | ------------------- | ----------------------------------- |
  | 있음                | 누수 없음                           |
  | 없음                | **21,817 bytes** (zustand + 스토어) |

  Turbopack 의 해석기는 Rust 라 소스 grep 으로 확인이 안 된다. 그래서 조건을 뺀 대조군까지
  돌려 인과를 고정했다. 확인 명령:

  ```bash
  grep -rl "zustand" apps/host/.next/static --include='*.js'
  ```

- **대가: 타입은 통과하고 빌드가 잡는다.** 타입 해석은 `default` 조건으로 가므로
  `index.d.ts`(훅 포함)를 본다. 서버 코드에서 `useCart` 를 import 하면 `tsc` 는 통과하고
  `next build` 에서 걸린다.

  ```
  Error: Export useCart doesn't exist in target module
  The export useCart was not found in module .../dist/server.js [app-rsc] (ecmascript).
  ```

  파일과 심볼과 그래프(`[app-rsc]`)를 다 짚어 준다. React 를 쓸 때와 같은 실패 모양이다.

- **도메인이 늘면 어떻게 되나 — `package.json` 은 안 자란다.**

  도메인이 늘어도 진입점은 `"."` 하나다. 자라는 건 `src/server.ts` 의 줄이고, 그건
  `package.json` 이 아니라 **소스**다. 리뷰에서 diff 로 보이고, 무엇이 서버에 안전한지가
  한 파일에 모인다.

  도메인별 진입점이 정말 필요해지는 날(예: `@mfa/store/cart` 만 따로 받고 싶다)에도
  이름을 하나씩 지어내지 않는다. 패턴 한 줄이면 된다:

  ```jsonc
  "./*": {
    "react-server": "./dist/*/server.js",
    "default":      "./dist/*/index.js"
  }
  ```

  도메인 × 환경이 전부 규칙 하나로 덮인다. **이 저장소에서는 아직 쓰지 않는다** —
  도메인이 `cart` 하나뿐이라 지금 넣으면 없는 문제에 대비하는 구조가 된다.

- 대안 검토:
  - **contracts 유지** → 위 맥락. remote 가 안 쓰는 규칙이 props 계약 패키지에 남는다.
  - **`@mfa/contracts` 의 정의를 넓힌다**("공유 도메인까지 담는다") → `PRODUCTS` ·
    `formatKRW` 가 이미 그렇게 살고 있어 일관성은 생긴다. 그러나 ADR-013 이 하루 전에
    반대 방향으로 그은 선을 되무르는 일이고, 코덱이 cart 폴더에서 멀어지는 문제는
    그대로다.
  - **새 패키지 `@mfa/cart-format`** → 경계는 가장 정확하지만 파일 하나짜리 패키지가
    늘고 MF `shared` 고려 대상이 하나 더 생긴다. 값이 안 맞는다.

- 대가:
  - ❌ host 가 `@mfa/store` 에 의존하게 됐다. 이 의존이 없던 유일한 앱이었다. 다만
    닿는 표면은 순수 함수 진입점 하나(`apps/host/src/lib/cart-cookie.ts` 한 파일)고,
    브라우저 번들은 위 실측대로 변화가 없다.
  - ❌ 표면이 둘이 됐다(`index.ts` · `server.ts`). 진입점은 하나지만 "무엇이 서버에
    안전한가"를 **사람이 유지해야 한다.** 누가 `server.ts` 에 `'use client'` 모듈을
    재수출하면 타입 · 린트 · 빌드가 전부 통과하고 브라우저 번들에만 나타난다 —
    이 불변식은 이제 **린트가 지킨다**(`packages/store/eslint.config.js`) — 실제로
    `server.ts` 에 `'use client'` 가 박혀 dev 콘솔에서만 터진 적이 있다(known-issues E-5).
    다만 린트가 막는 건 그 파일의 디렉티브 하나고, `'use client'` 모듈을 **재수출**하는
    경우는 여전히 사람이 본다(known-issues E-4).
  - ❌ 서버 코드에서 훅을 import 해도 `tsc` 는 통과한다. `next build` 가 잡는다.
  - ⭕ 저장 표현을 바꾸는 변경이 `cart/` 폴더 안에서 끝난다.
  - ⭕ contracts 가 다시 props 계약 + 공유 도메인 데이터만 담는다.

## ADR-016 — 장바구니 초기값은 props 로 내려보낸다. zustand Provider 는 쓰지 않는다

- 상태: 채택 (2026-08-22)
- 맥락: ADR-014 이후 `/`·`/cart`·`/checkout` 과 헤더가 각각 `readCartLines()` 를 부르고
  `initialLines` 를 remote 까지 내려보낸다. "props 드릴링처럼 보이는데 zustand 의
  Provider(context) 패턴으로 걷어낼 수 없나"를 검토했다.

- 결정: **걷어내지 않는다.** props 가 이 구조에서 서버 → 클라이언트의 유일한 통로다.
  대신 **중복만** 없앤다(아래 "대신 한 것").

- 왜 Provider 가 안 되나 — 제약 세 개가 동시에 걸린다.
  1. **번들 경계.** host·catalog·cart 가 `@mfa/store` 사본을 각자 가진다. 스토어는
     `globalSingleton` 으로 realm 당 하나여야 한다(ADR-004 · ADR-012). context 를 쓰면
     **context 객체 자체도** 싱글턴으로 싸야 한다 — 전역 하나 줄이려다 하나 는다.
  2. **서버는 스토어를 못 쓴다.** 모듈 싱글턴 스토어에 서버가 값을 심으면 동시 요청끼리
     장바구니가 샌다. zustand 5 의 Next 가이드가 "전역 스토어 금지 / RSC 는 스토어를
     읽지도 쓰지도 마라"라고 쓰는 게 정확히 이것이다. 지금은 서버에서 persist 가 통째로
     스킵되어 스토어가 **항상 비어 있다** — 우연이 아니라 이게 안전장치다.
  3. **ADR-014.** 첫 HTML 에 장바구니가 들어가야 전이가 없다. 그래서 쿠키를 `<Suspense>`
     밖에서 읽고 그 라우트만 프리렌더를 포기한다.

  Provider 는 **모든 소비자보다 위**에 있어야 하는데 소비자가 두 군데다 — 헤더 배지는
  `layout.tsx`, 패널·주문서는 `children`. 둘을 덮으려면 루트 레이아웃이고, 그러면:

  | Provider 배치       | 결과                                                              |
  | ------------------- | ----------------------------------------------------------------- |
  | layout, Suspense 밖 | **전 라우트** 프리렌더 사망. `/lab` 캐시 실험까지 죽는다          |
  | layout, Suspense 안 | children 을 감싸야 하므로 페이지 전체가 스트리밍 뒤로 → 전이 부활 |
  | 페이지마다 Provider | 헤더 배지가 밖 → 스토어 인스턴스 2개 → 담아도 배지가 안 변한다    |

  즉 Provider 는 `initialLines` 를 없애는 게 아니라 **layout 으로 옮기는 것**이고,
  그 대가가 ADR-014 다.

- 기각한 대안:
  - **remote 가 직접 쿠키를 읽는다** → remote 는 Vite · Rsbuild 앱이라 `next/headers` 를
    못 쓴다. SSR 번들이 host 서버에서 돌긴 하지만 요청 컨텍스트에 닿는 배선이 없다.
    그 배선이 곧 props 다.
  - **서버에서 전역 스토어를 seed 한다** → 위 2번. 요청 간 상태 누출이다.
  - **AsyncLocalStorage 로 요청 스코프 주입** → `.run()` 으로 렌더를 감쌀 자리가 없다
    (proxy/middleware 는 렌더와 다른 런타임이다).

- 대신 한 것 — 통로는 두고 **중복**을 없앴다.
  - `useCartLines(initialLines)` (`packages/store/src/cart/use-cart-lines.ts`).
    탭 동기화(`useCartSync`) · 하이드레이션 경계(`useHydrated`) · 경계 전후 값 선택을
    한 훅이 쥔다. remote 세 곳이 같은 네 줄을 복붙하고 있었다. `useCartSync` 는 배럴에서
    내렸다 — 둘 다 공개하면 "탭 동기화를 누가 거는가"가 화면마다 갈린다.
  - host 의 `CartSlot` · `CheckoutSlot`(`SiteHeaderSlot` 과 같은 꼴). 쿠키를 읽는 서버
    껍데기가 client 섹션을 감싼다. 페이지에는 **라우트 정책만** 남는다(`instant = false`).

- 대가:
  - ❌ `initialLines` 는 그대로 contracts 의 props 계약에 남는다. remote 는 여전히
    "서버가 넘겨준 초기값"이라는 개념을 안다 — 다만 그걸 **어떻게 쓰는지**는 모른다.
  - ❌ `instant = false` 는 라우트마다 리터럴로 반복된다. 세그먼트 설정은 정적 분석
    대상이라 `export { instant } from ...` 로 공유할 수 없다.
  - ⭕ 하이드레이션 경계 규칙이 `@mfa/store` 한 파일에만 있다. 경계가 바뀌면 고칠 자리도 하나다.
  - ⭕ 장바구니를 어디서 읽는지가 라우트 수만큼 흩어지지 않는다 — 슬롯 셋뿐이다.
  - ⭕ ADR-014 의 라우트 표가 그대로다(`/`·`/cart`·`/checkout` = ƒ, `/lab` = ◐).

## ADR-017 — remote 이름의 원본은 `REMOTES` 의 키 하나다

- 상태: 채택 (2026-08-25)
- 맥락: `packages/remote-config` 가 remote 이름을 **세 번** 적고 있었다.

  ```ts
  export const REMOTE_NAMES = ['catalog', 'cart'] as const; // ①
  export const REMOTES = {
    catalog: {
      // ② 키
      name: 'catalog', // ③ 필드
  ```

  주석은 `satisfies Record<RemoteName, RemoteDefinition>` 가 "불일치를 컴파일 타임에
  잡는다"고 적고 있었는데 **반만 맞다.** `satisfies` 는 키 집합만 본다. `name` 필드 타입이
  `RemoteName` 이라 아래가 `tsc --strict` 를 그대로 통과한다(실측).

  ```ts
  catalog: { name: 'cart', devPort: 3001 },   // 에러 없음
  ```

  잡아주는 건 런타임 테스트 하나뿐이었다(`index.test.ts`, `REMOTE_LIST.map(r=>r.name)`).

- 결정: **`REMOTES` 를 원본으로 삼고 나머지를 파생한다.** `name` 필드를 지우고,
  `RemoteName` 과 `REMOTE_NAMES` 를 `REMOTES` 에서 뽑는다.

  ```ts
  export const REMOTES = { catalog: {…}, cart: {…} } as const satisfies Record<string, RemoteConfig>;
  export type RemoteName = keyof typeof REMOTES;
  export const REMOTE_NAMES = Object.keys(REMOTES) as readonly RemoteName[];
  export const REMOTE_LIST = REMOTE_NAMES.map((name) => ({ name, ...REMOTES[name] }));
  ```

  remote 를 추가하려면 `REMOTES` 에 항목 하나를 넣는 것이 전부다. "이름만 추가하고 정의를
  빠뜨린" 상태도, "키와 필드가 어긋난" 상태도 **성립하지 않는다.**

- 왜 반대 방향(`REMOTE_NAMES` 를 원본으로)이 아닌가: `name` 필드를 남긴 채로
  `RemoteName = keyof typeof REMOTES` 를 쓰면 `RemoteDefinition.name: RemoteName` 이
  순환이 된다. 필드를 지우면 그 순환이 사라진다 — 지우는 쪽이 곧 원본을 하나로 만드는 쪽이다.

- 대안으로 검토하고 기각한 것: 매핑 타입으로 키와 필드를 묶는 방법.

  ```ts
  } as const satisfies { readonly [N in RemoteName]: RemoteDefinition<N> };
  ```

  어긋남은 컴파일 에러로 잡힌다(실측 확인). 하지만 이름은 여전히 세 번 적힌다 —
  **어긋날 수 없게** 만들 뿐 **중복을 없애지는** 못한다. 이 저장소의 SSOT 규칙은 후자다.

- 대가:
  - ❌ `REMOTE_NAMES` 순서가 `Object.keys` 의 삽입 순서에 달린다. 문자열 키라 스펙상
    보장되지만(정수 인덱스 키가 아니라 재정렬되지 않는다) 배열 리터럴로 **눈에 보이던**
    계약이 코드에서 사라졌다. `index.test.ts` 에 회귀 테스트로 남겼다.
  - ❌ `as const` 튜플성을 잃어 `REMOTE_NAMES.length` 가 `2` 리터럴이 아니라 `number` 다.
    리터럴 length 를 타입으로 쓰는 소비처는 없다(확인함).
  - ❌ `REMOTE_LIST` 항목이 `REMOTES[name]` 참조가 아니라 새 객체다. 참조 동일성에 기대는
    코드는 없다 — 소비처는 `name` · `devPort` · `env.publicUrl` 만 읽는다.
  - ⭕ 이름이 한 군데. remote 추가가 반쯤 된 채로 넘어갈 수 없다.
  - ⭕ 번들러 config 두 곳(`vite.config.ts` · `rsbuild.config.ts`)이 `REMOTES.catalog` 로
    이름을 이미 리터럴로 적고 `REMOTE.name` 으로 되읽던 것이 `const NAME = 'catalog'` 하나로
    줄었다. 오타는 `REMOTES[NAME]` 이 잡는다.

## 경계 설계 원칙

| 책임                  | 소유자                           | 이유                                                       |
| --------------------- | -------------------------------- | ---------------------------------------------------------- |
| 라우팅                | host                             | remote 에 `next/link` 를 강요하면 프레임워크 종속이 생긴다 |
| 레이아웃 · 헤더       | host                             | 셸은 하나여야 한다                                         |
| 상품 목록/상세 렌더링 | catalog remote                   | 도메인 소유 팀이 UI 를 통째로 배포                         |
| 장바구니 UI           | cart remote                      | 위와 동일                                                  |
| 장바구니 상태         | `@mfa/store` zustand 싱글턴      | 어느 쪽도 소유하지 않는 공유 패키지 (ADR-013)              |
| 장바구니 저장 포맷    | `@mfa/store` `cart/cookie-codec` | 서버(host)와 브라우저가 같이 보는 규칙 (ADR-015)           |
| 결제 플로우           | cart remote (`CheckoutFlow`)     | 라우터를 host 하나로 유지해야 소프트 내비게이션이 된다     |

remote 는 **props 와 콜백으로만** host 와 대화한다.
`onSelect(product)` → host 가 `router.push` 를 수행. remote 는 라우터를 모른다.
이 규칙 덕분에 remote 를 어느 라우트로 옮겨도 소프트 내비게이션이 유지된다.
