# 진행 상황

## 2026-08-14 (4차) — DTS 플러그인 검토 + 3차 오진 정정

### 오진 정정

3차에서 `[ dynamic-remote-type-hints-plugin ] err: [object Event]` 의 원인을
`dts` 로 지목했는데 **틀렸다.** 실제 스위치는 **`dev` 옵션**이다.

```js
// dts-plugin/dist/index.js — DevPlugin.apply()
if (!isDev() || normalizedDev === false) return;            // dev 빌드에서만
if (!normalizedDev.disableDynamicRemoteTypeHints) {
  runtimePlugins.push('.../dynamic-remote-type-hints-plugin.js');
}
```

`dts: false` 로 사라진 건 `DtsPlugin.apply()` 가 조기 return 하면서
그 안의 `DevPlugin` 도 같이 빠진 **간접 효과**였다.

3차에서 근거로 든 `grep dist/remoteEntry.js → 0` 도 **무효한 검증**이었다.
이 플러그인은 `isDev()` 때문에 프로덕션 번들에 애초에 들어가지 않는다.
`dts` 설정과 무관하게 항상 0 이 나온다.

### 실측 (catalog dev 서버가 서빙하는 모듈 그래프 스캔)

| 설정 | WS 플러그인 주입 | DTS 생성 |
| --- | --- | --- |
| `dts: true` (기본) | **있음** | 동작 |
| `dts: true` + `dev: { disableDynamicRemoteTypeHints: true }` | **없음** | 동작 |
| `dts: false` (현재) | 없음 | 안 함 |

**즉 "DTS 를 쓰려면 콘솔 에러를 감수해야 한다"는 전제가 틀렸다.**

### 결정 유지, 근거 교체

`dts: false` 는 그대로 둔다. 다만 근거를 정정했다.

- ~~콘솔 에러 때문~~
- 타입 SSOT 가 `@mfa/contracts` 라 정보 중복
- 타입 소비가 typecheck 에 remote 기동을 요구 → CI 순서 의존

### DTS 도입 검토 (별도 문서)

[01-research/03-dts-plugin-review.md](./01-research/03-dts-plugin-review.md) 신규.
결론: **보류.** SSR 로더 경로를 커버하지 못해 `RemoteModuleMap` 을 대체할 수 없고,
얻으려던 드리프트 검증은 remote 안 타입 제약으로 비용 없이 얻을 수 있다.
`mf dts --fetch` 로 번들러 플러그인 없는 host 도 타입 소비가 가능하다는 건 PoC 로 확인했다.

### 수정 범위

문서 4개 + remote 설정 주석 2개. **동작 코드 변경 없음.**

---

## 2026-08-14 (3차) — dev 콘솔 에러 2건 제거

사용자 리포트: `/legacy-checkout` 갔다가 뒤로가기 시
`[ dynamic-remote-type-hints-plugin ] err: [object Event]`.

### 원인과 조치

| # | 증상 | 원인 | 조치 |
| --- | --- | --- | --- |
| 1 | `[ dynamic-remote-type-hints-plugin ] err: [object Event]` | MF 의 `DevPlugin` 이 dev 빌드에서 주입하는 런타임 플러그인이 `ws://127.0.0.1:<port>` 연결 실패 시 콘솔 에러 | 두 remote 모두 `dts: false` (⚠️ 원인 진단은 4차에서 정정) |
| 2 | `_jsxDEV is not a function` (catalog 첫 로드 페이지에서만) | Vite dev 의 지연 optimizeDeps. remote 는 host 페이지 안에서 돌아 Vite 의 자동 새로고침이 오지 않음 | catalog 에 `optimizeDeps.entries` + `include` 지정해 기동 시 사전 번들링 |

과정에서 오진으로 서브엔트리 공유를 제거했다가
`Failed to bridge external shared module "react-dom/client"` 를 만났다.
`@module-federation/vite` 는 서브엔트리를 shared 목록에 자동으로 올리므로 host 가 반드시 제공해야 한다.
대신 넘기는 값의 모양을 `apps/host/src/mf/interop.ts` 의 `normalizeModule()` 로 정규화했다
(브라우저 shared + 서버 로더 require 셰임 양쪽).

### 검증

| 검증 | 결과 |
| --- | --- |
| `/debug` → zone(하드) → 뒤로 → `/` → 뒤로 (dev) | ✅ 콘솔 에러 0 |
| 동일 시나리오 (prod) | ✅ 콘솔 에러 0 |
| catalog 첫 로드 순서 `/debug` → `/` | ✅ 상품카드 8, 에러 0 |
| SSR + 소프트 내비 전체 재검증 (dev/prod) | ✅ 이전과 동일 |
| `grep -c dynamic-remote-type-hints dist/remoteEntry.js` | ✅ 0, 0 |
| build / lint / typecheck | ✅ 18/18 |

---

## 2026-08-14 (2차) — remote SSR + 소프트 내비게이션 확보

요구사항 추가: **① remote 영역 SSR 필수 ② 경계 이동은 소프트 내비게이션 필수**
초판 설계(CSR-only MF + Multi-Zones)는 두 요구를 각각 하나씩만 만족해 재설계했다.

### 한 일

- [x] `@module-federation/node` 2.7.49 검토 → peer 가 `webpack ^5.40` 이라 host(Turbopack)에 부적합, 기각
- [x] remote 를 **웹/노드 두 타깃**으로 빌드하도록 변경
  - catalog: `vite.config.server.ts` (SSR 빌드, CJS, react external)
  - cart: `rsbuild.server.config.ts` (`target: node`, `commonjs2`, react external)
  - dev 서버에서 `/mf-server.cjs` 를 서빙하는 미들웨어 추가 (Vite / Rsbuild 각각)
- [x] host 서버 로더 작성 (`apps/host/src/mf/server-loader.ts`)
  - fetch + `new Function` 으로 CJS 평가, host React 를 require 셰임으로 주입
  - node builtin 미사용 → 브라우저 번들에서도 안전
- [x] `loadRemoteModule` 을 isomorphic 으로 통합 (`typeof window` 분기)
- [x] `RemoteComponent` 의 client-only 게이트 제거 → SSR 경로 활성화
- [x] 결제 화면을 zone → **`cart/CheckoutFlow` remote 로 이전** (라우터를 host 하나로 통일)
- [x] Multi-Zone 앱을 `/legacy-checkout` 으로 이동, 비교용으로만 유지
- [x] remote 를 SSR 하는 라우트 전부 `force-dynamic`
- [x] 문서 갱신: ADR 재정리, `02-architecture/03-ssr-and-soft-nav.md` 신규

### 검증 결과

| 검증 | 방법 | 결과 |
| --- | --- | --- |
| remote SSR — 상세 | `curl /products/kb-001` | ✅ `Aurora 75` 초기 HTML 포함 |
| remote SSR — 결제 | `curl /checkout` | ✅ `주문서` 초기 HTML 포함 |
| remote SSR — 장바구니 | `curl /cart` | ✅ 셸 인라인 |
| remote SSR — 홈 | `curl /` | ✅ 동일 응답 내 포함(React 스트리밍) |
| 소프트 내비 `/`→`/checkout` | Playwright document 요청 수 | ✅ **0건** |
| 소프트 내비 `/`→`/products/:id` | 동일 | ✅ **0건** |
| 하드 내비 `/`→`/legacy-checkout` | 동일 | ✅ **1건** (대조군) |
| hydration | 브라우저 콘솔 | ✅ 에러/경고 **0건** |
| 크로스 remote 상태 | 담기 → 헤더 배지 | ✅ `0/0원` → `1/189,000원` |
| build / lint / typecheck | `turbo run` | ✅ 14/14 통과 |

### 새로 생긴 비용

- remote 마다 빌드 산출물 2벌, dev 프로세스 2개
- host **서버**가 remote 코드를 실행 → origin 허용목록 · 무결성 검증 필요(미구현)
- Node 런타임 전용 (Edge 불가)

---

## 2026-08-14 (1차) — 초기 셋업 + 실험 A/B

### 한 일

- [x] `@module-federation/nextjs-mf` EOL 실사 (npm peer 범위 직접 조회)
- [x] 대체재 리서치 — 런타임 MF / Multi-Zones / Vite MF / single-spa / native federation
- [x] `@module-federation/vite` 검토 (사용자 요청 항목) → remote 빌드용으로 채택
- [x] pnpm + Turborepo 모노레포 스캐폴딩 (앱 4 + 패키지 4)
- [x] host: Next.js 16.3.1 / Turbopack / App Router
- [x] remote-catalog: Vite 8 + `@module-federation/vite`
- [x] remote-cart: Rsbuild 2 + `@module-federation/rsbuild-plugin` (일부러 다른 번들러)
- [x] zone-checkout: Next.js 16 Multi-Zone
- [x] 타입 안전 remote 로더 (`RemoteModuleMap` 기반)
- [x] remote 장애 격리 (`RemoteBoundary`) + 진단 화면 (`/debug`)
- [x] 크로스 remote 장바구니 상태 공유 (`globalThis` 싱글턴 + localStorage)
- [x] ESLint 10 flat config + typescript-eslint 8 + `eslint-plugin-react-hooks` 7
- [x] `pnpm build` / `lint` / `typecheck` 전부 통과
- [x] Playwright(Chromium) 로 런타임 동작 실측 검증

### 검증 결과 요약

| 검증 | 결과 |
| --- | --- |
| host 가 Vite remote 소비 | ✅ 상품 카드 8개 렌더 |
| host 가 Rsbuild remote 소비 | ✅ 배지 + 패널 렌더 |
| React 단일 인스턴스 공유 | ✅ 콘솔 에러 0, share scope 3 |
| 번들러가 다른 두 remote 간 상태 공유 | ✅ `0/0원` → `1/189,000원` |
| Multi-Zone rewrite | ✅ `:3000/checkout` 이 zone 응답 |
| zone 으로 장바구니 인계 | ✅ localStorage 복원 |
| `next build` 프로덕션 빌드 | ✅ host 5라우트 / zone 2라우트 |

### 당시 확인된 제약

- ~~remote UI 는 SSR 되지 않음~~ → **2차에서 해소**
- ~~zone 경계는 하드 내비게이션~~ → **2차에서 Multi-Zones 자체를 기각**
- TypeScript 는 7.0.2 대신 6.0.3 고정 (typescript-eslint peer 제약) — 유효

---

## 다음에 해볼 것

- [ ] remote SSR 번들 신뢰 경계 강화 — origin 허용목록 + SRI/서명 검증
- [ ] remote 버전 핀/롤백 전략 — 엔트리 URL 에 버전 경로(`/v2026-08-14/mf-server.cjs`)
- [ ] remote 재배포 시 host 서버 캐시 무효화 경로 (현재는 프로세스 재시작 필요)
- [ ] remote 배포 파이프라인 시뮬레이션 (remote 만 재배포했을 때 host 무중단 여부)
- [ ] SSR 실패 시 CSR 폴백 — 서버 로드 실패해도 브라우저에서 재시도
- [ ] 초기 로딩 성능 측정 — SSR 경로의 TTFB / LCP 정량화
- [ ] 프레임워크 혼용 remote (Vue/Svelte)로 자유도 한계 확인
- [ ] 인증 토큰 공유 전략 (현재는 장바구니만 다룸)
- [ ] `@module-federation/bridge-react` 로 remote 안에 자체 라우터 두는 패턴 검증
