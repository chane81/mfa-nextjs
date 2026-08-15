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

## 경계 설계 원칙

| 책임 | 소유자 | 이유 |
| --- | --- | --- |
| 라우팅 | host | remote 에 `next/link` 를 강요하면 프레임워크 종속이 생긴다 |
| 레이아웃 · 헤더 | host | 셸은 하나여야 한다 |
| 상품 목록/상세 렌더링 | catalog remote | 도메인 소유 팀이 UI 를 통째로 배포 |
| 장바구니 UI | cart remote | 위와 동일 |
| 장바구니 상태 | `@mfa/contracts` 싱글턴 | 어느 쪽도 소유하지 않는 공유 계약 |
| 결제 플로우 | cart remote (`CheckoutFlow`) | 라우터를 host 하나로 유지해야 소프트 내비게이션이 된다 |

remote 는 **props 와 콜백으로만** host 와 대화한다.
`onSelect(product)` → host 가 `router.push` 를 수행. remote 는 라우터를 모른다.
이 규칙 덕분에 remote 를 어느 라우트로 옮겨도 소프트 내비게이션이 유지된다.
