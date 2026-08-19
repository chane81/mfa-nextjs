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

- 상태: 채택
- 맥락: host, catalog(Vite), cart(Rsbuild)는 서로 다른 번들이다.
  `@mfa/contracts` 가 각 번들에 중복 포함되면 장바구니 상태가 갈라진다.
- 결정: 스토어를 `globalThis.__MFA_CART_STORE__` 에 심는다.
  MF `shared` 설정이 어긋나도 상태는 하나로 유지된다.
- 결과:
  - ⭕ MF 설정 실수에 강건하다. Multi-Zones 쪽에서도 `localStorage` 로 이어진다.
  - ⭕ `useSyncExternalStore` 로 구독 → React 버전에 독립적.
  - ⚠️ 전역 네임스페이스 오염. 실무에서는 키에 앱 네임스페이스를 반드시 붙일 것.

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

## 경계 설계 원칙

| 책임                  | 소유자                       | 이유                                                       |
| --------------------- | ---------------------------- | ---------------------------------------------------------- |
| 라우팅                | host                         | remote 에 `next/link` 를 강요하면 프레임워크 종속이 생긴다 |
| 레이아웃 · 헤더       | host                         | 셸은 하나여야 한다                                         |
| 상품 목록/상세 렌더링 | catalog remote               | 도메인 소유 팀이 UI 를 통째로 배포                         |
| 장바구니 UI           | cart remote                  | 위와 동일                                                  |
| 장바구니 상태         | `@mfa/contracts` 싱글턴      | 어느 쪽도 소유하지 않는 공유 계약                          |
| 결제 플로우           | cart remote (`CheckoutFlow`) | 라우터를 host 하나로 유지해야 소프트 내비게이션이 된다     |

remote 는 **props 와 콜백으로만** host 와 대화한다.
`onSelect(product)` → host 가 `router.push` 를 수행. remote 는 라우터를 모른다.
이 규칙 덕분에 remote 를 어느 라우트로 옮겨도 소프트 내비게이션이 유지된다.
