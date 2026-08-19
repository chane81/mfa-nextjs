# 진행 상황

## 2026-08-19 (11차) — 장바구니 스토어를 zustand 로 이행하고 `@mfa/store` 로 분리

직접 구현한 스토어(리스너 Set · 스냅샷 재계산 · localStorage 배선 · `useSyncExternalStore`)를
`zustand/vanilla` + `persist` 로 갈아탔다. **싱글턴 배치는 그대로다** — 상태는 zustand 모듈이
아니라 스토어 인스턴스에 있으므로, 번들이 갈려도 장바구니가 하나이려면 인스턴스가
`globalThis` 에 있어야 한다. 결정 근거는 [ADR-012](./02-architecture/01-decision.md).

### 한 일

- [x] `packages/store`(`@mfa/store`) 신설 — 런타임 공유 상태의 새 SSOT.
      **도메인별 폴더**(`src/cart/`)로 나누고, 각 도메인의 공개 표면을 `<도메인>/index.ts`
      에 정한 뒤 루트 `src/index.ts` 가 모은다. 진입점은 `@mfa/store` 하나
- [x] 스토어를 `createStore()(persist(...))` 로 재작성.
      상태는 `lines` 하나, 액션 4개(`add`·`setQuantity`·`remove`·`clear`)
- [x] `persist` 미들웨어가 localStorage 를 맡는다 — `partialize` 로 `lines` 만 저장,
      `createJSONStorage` getter 가 서버에서 던져 persist 를 통째로 건너뛴다
- [x] 파생값(합계)은 상태에서 뺐다. **셀렉터가 아니라 순수 함수** `cartTotals(lines)` 다 —
      상태의 조각이 아니라 화면이 쓰는 계산값이라 구독·비교와 얽힐 이유가 없다
- [x] 훅은 `@mfa/store/cart/hooks` 로 — `useStore` 기반. `useCartLines` · `useCartTotals` ·
      `useCart` 로 쪼개 구독 범위를 좁혔다(`CartBadge` 는 합계만 구독)
- [x] **공개 표면은 둘뿐이다** — `useCart(selector)` · `cartTotals(lines)`.
      스토어 인스턴스와 팩토리는 내보내지 않는다
- [x] 상대 경로에서 `.js` 확장자를 뺐다 — `@mfa/store` 에서 시작해 `contracts` · `ui` ·
      remote 앱 소스까지 저장소 전역으로 맞췄다. 예외는 `@mfa/remote-config` 하나
      (Node 가 직접 읽는다). raw Node 로드만 깨지고 CI 는 못 잡는다는 성질은 D-1 에 기록
- [x] 셀렉터는 패키지에 정의하지 않고 **호출부가 정한다**.
      `useCart((state) => state.lines)` · `useCart((state) => state.add)`.
      비교는 훅이 `shallow` 로 못 박는다 — 객체로 묶어 뽑아도 호출부는 그대로 쓴다
- [x] 싱글턴 장치를 `src/utils/global-singleton.ts` 로 뽑았다 —
      `globalSingleton(name, create)`. 도메인마다 전역 키를 새로 파는 대신
      `Symbol.for('@mfa/store/singletons')` 레지스트리 하나를 이름으로 가른다
- [x] 스토어를 `createWithEqualityFn`(`zustand/traditional`)로 만든다. 반환값이 곧 훅이라
      배선 코드가 없고, **기본 비교 함수로 `shallow`** 를 박아 호출부가 비교를 챙기지
      않아도 된다. 도메인 쪽은
      `export const useCart = globalSingleton(STORE_NAME, createCartStore)` 한 줄
- [x] `create`(`zustand/react`)는 안 쓴다 — 비교가 `Object.is` 로 고정이라
      `useCart((state) => ({ clear, setQuantity }))` 같은 셀렉터가 무한 렌더로 간다
- [x] 호출부 6곳 이행
- [x] `@mfa/contracts` 정리 — 스토어와 zustand 의존, 스토어 때문에 있던
      tsconfig 의 `lib: ["DOM", ...]` 오버라이드 제거. 이제 타입 계약만 남았다
- [x] `@mfa/ui` 는 의존성 0 이 됐다 — cart 훅이 나가면서 contracts·zustand 둘 다 빠짐
- [x] `zustand@5.0.15` 는 `@mfa/store` 한 곳만 가진다

### 왜 contracts 에서 뺐나

contracts 는 **타입 계약**(remote 가 무엇을 노출하는가), 스토어는 **런타임 상태**(값이
변하고 구독자가 있고 localStorage 를 만진다)다. 한 패키지에 두면 타입만 필요한 소비처까지
zustand 와 DOM 타입을 끌고 온다.

cart remote 가 소유하는 안이 도메인상 가장 정직하지만 지금은 접었다 — **catalog remote 도
스토어에 쓴다**("담기"). 옮기려면 catalog 가 `onAddToCart` 콜백을 props 로 받고 host 가
cart 로 배선하는 계약 변경이 함께 필요하다. 근거와 대안은
[ADR-013](./02-architecture/01-decision.md).

### API 표면을 깎았다 — 무엇을 지웠고 무엇은 못 지우나

편의 래퍼 셋을 지웠다.

| 지운 것                   | 대체                         | 왜 지워도 되나                    |
| ------------------------- | ---------------------------- | --------------------------------- |
| `cartActions`             | `useCartActions()`           | 소비처가 전부 React 컴포넌트다    |
| `selectTotals` + 1칸 캐시 | 순수 함수 `cartTotals()`     | 렌더 중 계산이면 비교가 필요 없다 |
| `getCartStore()`          | 패키지 내부 `cartStore` 상수 | 함수 호출이 한 겹 필요 없었다     |

**전역 레지스트리 조회는 못 지운다.** 훅에서 `createCartStore()` 를 바로 부르면 번들마다
(host · catalog · cart) 스토어 인스턴스가 따로 생긴다. 증상은 "catalog 에서 담았는데
cart 배지는 0", 그리고 빌드·타입체크·린트는 전부 통과한다. 그래서 인스턴스 생성은
`createCartStore()` 에 남기되(테스트 격리용), 앱이 쓰는 것은 `globalSingleton('cart', …)` 을
거쳐 만든 `cartStore` 상수 하나다(패키지 내부에만 있다). 실측: 같은 모듈을 두 번 평가해도
인스턴스는 하나이고,
`globalThis` 의 자체 프로퍼티는 0개다(레지스트리가 심볼 키라서).

### SSR 이 그대로 안전한 이유

`useStore` 는 서버 스냅샷으로 `getInitialState()` 를 넘긴다(zustand 5.0.x `src/react.ts`).
이 값은 **스토어 생성 시점에 캐시된 초기 상태**라, persist 가 localStorage 에서 복원한
값이 섞이지 않는다. 그래서 `skipHydration` + 수동 `rehydrate()` 를 쓰지 않았다.
서버 렌더와 hydration 렌더가 둘 다 빈 장바구니라서 mismatch 가 없다.

### 밟을 뻔한 것 — zustand 5 의 셀렉터 규칙

v5 의 기본 비교는 `Object.is` 다(v4 의 얕은 비교가 빠졌다). **새 객체를 돌려주는 셀렉터**는
매 렌더 다르다고 판정되어 무한 렌더로 간다. 셀렉터를 호출부가 쓰게 만든 뒤로는 이 함정도
호출부로 옮겨가는데, 그건 스토어 쪽 사정이지 화면의 관심사가 아니다. 그래서 `useCart` 가
안에서 `shallow` 를 쓰고 비교 방식을 밖으로 열지 않는다.

훅은 `useStoreWithEqualityFn`(`zustand/traditional`) + `shallow`(`zustand/shallow`) 를 쓴다.
비교 함수를 인자로 받는 형태라 셀렉터를 감싸지 않아도 되고, 서버 스냅샷은 이 훅도
`getInitialState()` 로 가져가므로(`src/traditional.ts` 의 `useSyncExternalStoreWithSelector`
3번째 인자) hydration 안전성은 그대로다. 앱은 zustand 를 직접 의존하지 않는다 —
`shallow` 를 포함해 zustand 는 `@mfa/store` 안에만 있다.

**대가:** `zustand/traditional` 은 `use-sync-external-store` 를 optional peer 로 요구한다.
설치돼 있지 않았으므로 `@mfa/store` 의 dependencies 에 `use-sync-external-store@1.6.0` 을
추가했다. `useStore` + `useShallow` 조합이었다면 필요 없는 의존성이다.

### 실측

`pnpm typecheck` · `pnpm lint` · `pnpm build` 전부 통과(패키지 11개). host 프리렌더 HTML 에
cart remote 의 마크업이 빈 장바구니 상태로 그대로 들어있다(`담긴 상품이 없습니다`,
badge 수량 0). remote SSR 번들이 Node 에서 평가되는 경로까지 확인된 셈이다.

## 2026-08-19 (10차) — Tailwind v4 도입, remote 가 자기 CSS 를 선언한다

초판은 CSS 를 아예 안 썼다. 세 앱의 CSS 파이프라인이 제각각(Next/Turbopack · Vite ·
Rsbuild)이라 `@mfa/ui` 의 인라인 토큰(`tokens.ts`)으로 통일하는 쪽이 확실했기 때문이다.
지금은 세 번들러 모두 Tailwind v4 공식 연동이 있어서 그 회피가 필요 없어졌다.

### 한 일

- [x] `packages/tailwind-config` 신설 — `theme.css`(`@theme` 토큰 SSOT) + PostCSS 설정 원본.
      **빌드하지 않고 소스로 배포**하고 각 앱이 자기 파이프라인에서 컴파일한다
      (host·cart `@tailwindcss/postcss`, catalog `@tailwindcss/vite`)
- [x] `MF_FILES.styles` (`style.css`) 와 `stylesPath(version)` 을
      `@mfa/remote-config` 에 추가 — 주소 조립을 SSOT 안에 둔다
- [x] host 의 `RemoteComponent` 가 remote 스타일시트를 함께 건다 —
      `<link rel="stylesheet" precedence="mfa-remote">`. 모든 remote 소비가 지나가는
      단일 진입점이라 반복이 없고 누락이 불가능하다
- [x] 오리진은 `REMOTE_ORIGINS`(브라우저에서도 맞는 값), 경로는 `stylesPath(version)`
- [x] CSS 출력 규칙 고정 — catalog `cssCodeSplit: false` + `assetFileNames`,
      cart `distPath.css: ''` + `filename.css`
- [x] Vite dev 전용 미들웨어 — `/style.css` 를 `?direct` 로 변환해 `text/css` 로 돌려준다
- [x] catalog · cart 의 expose 와 `@mfa/ui` 컴포넌트를 클래스로 이행
- [x] host 화면 이행 — `layout.tsx` 가 `globals.css` 를 물고, body 기본값은 공유 base 레이어로
- [x] `@mfa/ui` 의 `tokens.ts` 제거. 남은 인라인 스타일은 런타임 값(`--hue`) 전달뿐이다
- [x] 전략·토큰·실측을 [02-architecture/05-styling.md](./02-architecture/05-styling.md) 로 분리

### 왜 host 가 remote CSS 를 안 가져오나

remote 컴포넌트는 host 페이지 안에서 렌더되는데 CSS 는 두 로딩 경로 어디로도 따라가지
않는다. 브라우저에서는 MF 런타임이 모듈만 가져오고, 서버에서는 CJS 문자열을 평가할 뿐이라
스타일시트를 실을 자리가 없다.

host 가 매니페스트를 **파싱해** CSS 주소를 캐내면 remote 의 빌드 산출물 구조에 묶인다.
대신 파일명을 계약으로 고정해 주소를 계산으로 알아내고, `<link>` 만 걸어 파싱은 브라우저에
맡긴다. 대가는 파일명 해시를 못 쓴다는 것이고, 캐시 무효화는 이미 있는 `/v<version>/`
불변 경로가 맡는다.

`<link>` 를 어디서 거는지는 한 번 옮겼다. 처음에는 remote 의 expose 마다
`<RemoteStyles />` 를 렌더했는데(계약이 remote 안에 닫힌다), expose 를 추가할 때마다
잊으면 **스타일 없는 화면이 에러 없이** 나오는 구조였다. 지금은 모든 remote 소비가 지나가는
`RemoteComponent` 에서 한 번 건다. layout 에 두는 안은 접었다 — 모든 라우트가 remote 를
로드하게 되고, CSS 를 받으려고 MF 모듈 왕복이 선행된다.

### 함정 셋

| 함정                                              | 증상                                                                                                  |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| 브라우저에서 `publicOrigin` 사용                  | 동적 env 접근이라 치환되지 않아 배포에서 `localhost` 를 가리킨다 — 오리진은 `WEB_ENTRIES` 에서 뽑는다 |
| Vite dev 가 CSS 를 JS 모듈로 서빙                 | `<link>` 로 받으면 브라우저가 **에러 없이** 통째로 무시한다                                           |
| Tailwind v4 자동 탐지가 `node_modules` 를 안 훑음 | `@mfa/ui` 가 쓰는 클래스가 조용히 빠진다 — 빌드는 성공하고 화면만 무너진다                            |

셋 다 재현 절차와 해결은 [05-troubleshooting/01-known-issues.md](./05-troubleshooting/01-known-issues.md#c-10차-tailwind-를-붙이면서-밟은-것들) 의 C 절에 있다.

### 실측

`pnpm build` 후 host 프리렌더 HTML 에 stylesheet `<link>` 3개가 전부 `<head>` 안에 있다 —
host(`precedence=next`) 하나와 remote 둘(`precedence=mfa-remote`). `index.html` 은 cart 의
expose 를 둘 렌더하는데 cart 의 `<link>` 는 하나만 남았다(React 19 중복 제거 동작 확인).
dev 에서는 버전 없는 경로가 나오고 두 remote 모두 `text/css` + `Access-Control-Allow-Origin: *`
로 응답한다.

## 2026-08-19 (9차) — 실패를 앞으로 당긴다 (CI · 버전 게이트 · 제한 시간)

기능이 아니라 **실패가 드러나는 시점**을 손본 회차다. 셋 다 같은 성격이다 —
원인이 안 보이는 자리에서 터지던 걸 원인이 보이는 자리로 옮겼다.

### 한 일

- [x] **Node 범위 고정** — `engines.node: ">=24.19.0 <25"` + `pnpm-workspace.yaml` 의
      `engineStrict: true` + `.nvmrc`. `@mfa/remote-config` 가 타입 스트리핑에 기대므로
      Node 버전이 곧 기능 요구사항이다.
- [x] **CI 도입** (`.github/workflows/ci.yml`) — job 2개. `verify`(lint · typecheck ·
      format:check) 와 `build`.
- [x] **remote 매니페스트 `version` 문자열 검증** — `assertSafeVersion` 으로 버전 디렉터리
      경로에 쓰이기 전에 형태를 확정한다.
- [x] **remote 호출에 제한 시간** — `AbortSignal.timeout(REMOTE_FETCH_TIMEOUT_MS)` 를
      버전 조회와 SSR 번들 fetch 양쪽에 건다. 실패 원인(제한 시간 초과 / 응답 이상 /
      검증 실패)을 구분해 로그에 남긴다.
- [x] 장애 격리 확인 방법을 실제 동작에 맞춰 다시 쓰고, 트러블슈팅에 **증상 색인** 추가
- [x] README 를 라이브 데모 먼저 보이도록 재배치, MIT 라이선스 추가

### 왜 이 셋인가

| 손댄 곳   | 고치기 전 증상                                                              | 고친 뒤                       |
| --------- | --------------------------------------------------------------------------- | ----------------------------- |
| Node 범위 | 설치는 통과하고 dev·프리렌더에서 `Missing initializer in const declaration` | `pnpm install` 이 먼저 막는다 |
| CI        | MF 계약이 깨져도 PR 이 초록                                                 | 빌드가 계약 테스트            |
| 제한 시간 | remote 가 응답 안 하면 host 요청이 같이 멈춘다 — 격리가 무의미              | 끊고 폴백, 원인 구분          |

빌드를 CI 에 넣은 게 핵심이다. host 의 `next build` 는 순수 컴파일이 아니라 프리렌더가
remote 의 SSR 번들을 HTTP 로 받아 **실제로 실행한다**(`apps/host/src/mf/server-loader.ts`).
그래서 빌드 통과 = "Next 16 에서 런타임 MF + SSR 이 된다"는 이 저장소의 유일한 주장이
아직 참이라는 뜻이다. 빠른 정적 검사와 붙여두면 느린 신호가 빠른 신호를 막아서 job 을 나눴다.

## 2026-08-18 (8차) — `_jsxDEV is not a function` 재발, 3차 오진 정정

`pnpm dev` 후 첫 로드에서 catalog 가 또 죽었다. 3차에서 "해결"로 적어둔 항목이라,
**그 원인 진단 자체가 틀렸다**는 뜻이었다.

### 오진 정정

3차는 원인을 "Vite 의 지연 optimizeDeps"로 보고 `optimizeDeps.entries` + `include` 를 넣었다.
그 설정은 재현 창을 좁혔을 뿐 닫지 못했다. 실제 원인은 **`@module-federation/vite` 의 expose
로더가 shared 대기를 `import()` 뒤에 두는 것**이다(1.20.7 실측).

```js
// virtual:mf-exposes:…
"./ProductGrid": async () => {
  await Promise.all([])                                  // ← 비어 있다
  const importModule = await loadExposedModule(
    "./ProductGrid",
    () => import("/src/exposes/ProductGrid.tsx")          // ← 여기서 loadShare 가 평가된다
  )
  if (dependencyPending?.then) await dependencyPending;   // ← 배리어가 import 뒤
}
```

exposes 는 automatic JSX runtime 이라 `jsxDEV` 를 **정적 import** 하고, 그 import 는 shared 를
가리킨다. 그래서 `import()` 되는 순간 공유 스코프가 비어 있으면 `jsxDEV` 가 `undefined` 로
굳는다. live binding 이라 나중에는 채워지므로 **사후 관측으로는 원인을 못 잡는다** — 리소스
타임라인을 봐야 보인다.

```
280→285  /src/exposes/ProductGrid.tsx
286→293  loadShare(react/jsx-dev-runtime)      ← 캐시 miss, undefined 로 굳는다
311→313  .vite/deps/react_jsx-dev-runtime.js   ← 실제 모듈은 20ms 뒤
```

기각된 가설: `.vite/deps` 의 `?v=<browserHash>` 스테일. 해시는 dev 재시작마다 바뀌지만
(`fdd741cb` → `b9eb7437` 실측) 브라우저는 항상 새 transform 을 받는다. 실패한 페이지에서
`.vite/deps` 요청은 전부 200 이었다.

### 한 일

- [x] `apps/remote-catalog/vite.config.ts` 에 `server.warmup.clientFiles: ["./src/exposes/*.tsx"]`
- [x] 같은 파일 `optimizeDeps` 주석 정정 — 이건 **의존성** 사전 번들링, warmup 은 **소스 파일**
      사전 transform. 단계가 달라 둘 다 필요하다
- [x] `scripts/wait-for-remotes.ts` 주석 정정 — 이 게이트는 HTTP 200 만 보므로 이 에러를 못 막는다.
      exposes 를 여기 넣지 않는 이유도 같이 적었다(매니페스트가 dev 모듈 URL 을 안 싣는다)
- [x] `docs/05-troubleshooting/01-known-issues.md` 0-4c 전면 개정

### 검증

| 조건 (dev 재시작 + 새 브라우저 세션) | 결과        |
| ------------------------------------ | ----------- |
| warmup 없음                          | ❌ 3/3 실패 |
| exposes 를 `curl` 로 수동 워밍       | ✅ 4/4 성공 |
| `server.warmup` 설정                 | ✅ 5/5 성공 |
| 같은 세션에서 새로고침 (대조)        | ✅ 5/5 성공 |
| catalog `typecheck` / `lint`         | ✅          |

### 교훈

"새로고침하면 낫는다"는 증상은 **깨진 시점의 값이 나중에 정상으로 채워져 있다**는 뜻일 수 있다.
그 상태에서 콘솔로 확인하면 전부 멀쩡해 보이고, 그래서 3차의 오진이 5차까지 살아남았다.
재현 조건을 먼저 고정하고(여기서는 dev 재시작 + 새 브라우저 세션 = 3/3), 대조군을 세운 뒤에
원인을 말해야 한다.

## 2026-08-17 (7차) — 환경변수를 remote 당 하나로

질문: **remote 하나에 환경변수가 세 벌씩 필요한가?**

`NEXT_PUBLIC_REMOTE_*_ENTRY` / `REMOTE_*_SSR_ENTRY` / `REMOTE_*_PUBLIC_URL` 셋의 실제 값은
도메인 하나였고, 다른 건 오리진 뒤에 붙는 파일명뿐이었다. 그 파일명은 이미 `MF_FILES` 에
있으니 **env 가 SSOT 를 문자열로 복제**하고 있었던 셈이다. 복제된 쪽이 어긋나면 404 가 아니라
"폴백 응답을 파싱하다 실패"로 나타나 원인이 로그에 안 보인다.

### 한 일

- [x] `RemoteEnvKeys` 를 `publicUrl` 하나로 축소 — remote N 개에 환경변수 N 개
- [x] `webManifestUrl()` / `ssrBundleUrl()` 이 오리진 + `MF_FILES` 를 조립. 호출부는 경로를 안 만든다
- [x] `NEXT_PUBLIC_` 접두사 제거 — 브라우저 전달은 `next.config.ts` → `env:` 경로를 타므로
      접두사가 하는 일이 없었다. `turbo.json` 의 와일드카드도 `REMOTE_*` 한 줄로
- [x] docker-compose / docker-host-local 을 **맥 LAN IP 단일 주소**로 전환
- [x] `docs/03-setup/03-environment.md` 신설 — 어느 `.env` 가 실제로 로드되는지가 앱마다 다르다
- [x] 스크립트 이름의 `.mjs` 잔재 정리 (`serve-remote-dist.mjs` → `.ts` 등)

### 왜 LAN IP 인가

같은 remote 오리진을 맥의 브라우저와 컨테이너(빌드·런타임)가 함께 읽는데, `localhost` 는
컨테이너 안에서 자기 자신이고 `host.docker.internal` 은 맥에서 안 풀린다. **양쪽에서 같은
곳을 가리키는 주소는 LAN IP 뿐**이라, 이걸 쓰면 docker 검증 경로에서도 remote 당 변수가
하나로 끝난다. 대안은 SSR 전용 오버라이드 변수를 하나 더 두는 것이었는데, 그건 "변수를
줄인다"는 목적과 정면으로 부딪혀서 버렸다.

### 검증

| 항목                                | 결과                                                   |
| ----------------------------------- | ------------------------------------------------------ |
| `turbo run typecheck` / `lint`      | ✅ 16/16                                               |
| `pnpm build` (host 프리렌더 포함)   | ✅ `next build exited with code 0`                     |
| 후행 슬래시 정규화 / 빈 `ARG` 폴백  | ✅ node 로 직접 확인                                   |
| `docker-host-local.sh` 전 구간      | ✅ EXIT=0                                              |
| 컨테이너 → 맥 LAN IP 도달성         | ✅ 빌드 프리렌더가 `192.168.68.50:3001` 에서 수신      |
| 컨테이너 런타임 remote SSR          | ✅ `/checkout` 에 `주문서`, ErrorBox 없음              |
| 서버가 심은 버전 경로 엔트리        | ✅ `http://192.168.68.50:3001/v<ver>/mf-manifest.json` |
| compose 변수 보간 (`MFA_HOST_IP:?`) | ✅ 미설정 시 메시지와 함께 exit 1, 설정 시 정상 해석   |

`docker compose up` 전체 기동은 안 돌렸다 — `docker-host-local.sh` 가 같은 경로(빌드 컨테이너
→ 맥 LAN IP → 퍼블리시된 포트)를 이미 통과했고, compose 쪽은 파일 보간까지만 확인했다.

### 배포 실측

Dokploy 의 Build Args · 런타임 env 를 새 이름으로 교체한 뒤(저장소 밖 작업이라 UI 에서 직접
바꿨다) main 을 push 해 세 서비스가 모두 재빌드됐다. **env 이름 변경과 코드 변경은 같이 가야
한다** — 한쪽만 바뀐 구간에서는 host 빌드가 기본값 `localhost` 를 보고 프리렌더에서 죽는다.

| 검증                    | 결과                                                                          |
| ----------------------- | ----------------------------------------------------------------------------- |
| `/checkout` remote SSR  | ✅ HTTP 200, `주문서` 포함, ErrorBox 없음                                     |
| `/` 렌더                | ✅ HTTP 200, ErrorBox 없음                                                    |
| 서버가 심은 버전 엔트리 | ✅ `https://mfa-catalog.lakegreen.net/vtmsxe7mzs/…` (공개 도메인 + 버전 경로) |
| 빌드 버전 형태          | ✅ `tmsxe7mzs` / `tmsxe82rc` — 타임스탬프                                     |
| 서명 · 무결성           | ✅ 두 remote 모두 `signature` · `ssrIntegrity` 존재                           |

remote 당 환경변수 하나로 실제 배포가 돈다는 것까지 확인했다. Dokploy 설정 슬롯은 8개에서
6개로 줄었고, 그 6개가 전부 **같은 문자열**(도메인)이라 슬롯마다 접미사를 틀릴 여지가 없다.

## 2026-08-15 (6차) — 컨테이너 배포 (Dokploy)

질문: **remote 를 host 와 독립적으로 재배포할 수 있는가?** → 배포 표면을 먼저 만들었다.

앱마다 별도 Application 으로 올렸다(당시 4개, zone 삭제 후 3개). 한 Compose 로 묶으면 "remote 만 재배포"를
아예 시도할 수 없어서 미완 항목이 그대로 남는다.

### 한 일

- [x] Dockerfile — 빌드 컨텍스트는 저장소 루트(pnpm 워크스페이스)
- [x] Next 앱 `output: "standalone"` + `outputFileTracingRoot` (isolated 링커 대응)
- [x] remote 자산 URL 을 env 로 분리 — 하드코딩된 `localhost:3001/3002` 는 배포 불가였다
- [x] remote 진입점이 `dist` 를 영속 볼륨에 **덧붙인다** — `/v<ver>/` 불변성과 롤백 보존
- [x] 매니페스트 Ed25519 서명 — 개인키는 BuildKit secret, 공개키는 host 런타임 env
- [x] Watch Paths 로 앱별 재배포 분리 (`packages/**` 는 공통)
- [x] 배포 문서 `docs/03-setup/04-dokploy.md`
- [x] `middleware.ts` → `proxy.ts` (Next 16 에서 middleware 파일 규약 deprecated)
  - 파일명과 export 이름만 바뀌고 `config.matcher` 는 그대로. 빌드 출력도 `ƒ Proxy (Middleware)`
  - 5차의 "warm 라우트 인증은 middleware 여야 한다" 결론은 그대로 유효하다 — 이름만 바뀌었다

### 배포 환경 실측

| 검증                                                | 결과                                    |
| --------------------------------------------------- | --------------------------------------- |
| remote SSR (`/checkout` 초기 HTML)                  | ✅ `주문서` 포함                        |
| 서명 강제(`MF_REQUIRE_SIGNATURE=1`)에서 remote 로드 | ✅ 통과                                 |
| 서버가 remote 버전 핀 주입                          | ✅ `/v<ver>/mf-manifest.json` 절대 URL  |
| 불변 경로 캐시 헤더                                 | ✅ `max-age=31536000, immutable`        |
| 소프트 내비 (`/` → `/checkout`)                     | ✅ document 요청 0                      |
| 크로스 remote 상태 공유 (Vite → Rsbuild)            | ✅ `0원` → `189,000원`                  |
| zone 프록시 (`/legacy-checkout`)                    | ✅ 별도 앱 응답 — 확인 후 앱 삭제(아래) |

### Multi-Zones 폐기

대조군으로 남겨뒀던 `apps/zone-checkout` 을 삭제했다. 기각 판단은 2차에서 이미 끝났고,
배포 환경에서까지 동작을 확인(assetPrefix 프록시·하이드레이션·상호작용)한 뒤로는
얻을 게 없는데 앱 하나만큼의 유지 비용이 계속 들었다.

- [x] `apps/zone-checkout` 삭제
- [x] host 의 `/legacy-checkout*` rewrite 3개 + `ZONE_CHECKOUT_URL` 제거
- [x] 헤더의 `결제(zone·비교용)` 링크 제거 → 외부 링크 분기 자체가 사라져 `SiteHeader` 가 단순해졌다
- [x] turbo `globalEnv`, `docker-compose.yml`, `.env.local`, 배포 문서에서 zone 제거
- [x] Dokploy `mfa-zone-checkout` 서비스 삭제

**기각 근거는 남긴다.** 실험 기록(`04-experiments/02-multi-zones.md`)과 ADR-003 은
"앱 삭제됨" 표시만 붙여 유지했다. 나중에 같은 질문이 왔을 때 근거 없이 다시 재보는 게
더 비싸다.

### 배포에서만 드러난 결함

- 빈 문자열 env 가 `??` 를 통과해 빌드 버전이 사라졌다 → 배포 시점 env 는 `||` 로 읽는다
- Next standalone 이 `@swc/helpers` 의 ESM 파일을 빠뜨려 컨테이너가 부팅에서 죽었다
  (빌드는 성공, 배포는 Done 으로 끝난다) → `outputFileTracingIncludes` 로 해결.
  처음엔 Dockerfile 셸 19줄로 때웠는데 Next 공식 옵션 한 줄이면 됐다.
  pnpm 쪽 노브(`nodeLinker: hoisted`, `publicHoistPattern`)는 **배치**를 바꾸는 설정이라
  이 문제와 무관했다 — 무엇이 트레이스되는지의 문제였다

### 로컬 빌드 복구

배포만 되고 **로컬에서 `pnpm build` 가 안 됐다.** host 빌드는 프리렌더 도중 remote 의
SSR 번들을 HTTP 로 받아 실행하는데, 배포에서는 remote 가 이미 공개 도메인에 떠 있어서
그 요구사항이 보이지 않았다.

turbo 로 순서를 주면 될 것 같지만 아니다. 필요한 건 "먼저 빌드"가 아니라 **"떠 있는 상태"** 다.
turbo 공식 패턴(`with` 사이드카 + 유한 readiness 프로브)을 실제로 넣어보면 순서도 준비
대기도 정확히 동작하는데, 사이드카가 `persistent` 라 **`turbo run build` 가 끝나지 않는다.**

| 조각                                  | 담당                                                                 |
| ------------------------------------- | -------------------------------------------------------------------- |
| remote 를 먼저 빌드                   | turbo (`@mfa/host#build.dependsOn`)                                  |
| 빌드 동안 `dist` 서빙 · 끝나면 내리기 | host `build` 스크립트의 `concurrently --kill-others --success first` |

처음엔 전용 래퍼(`scripts/with-remote-dist.mjs`, 221줄)를 썼다가 `concurrently` 한 줄로 접었다.
래퍼가 하던 일 중 실제로 필요했던 건 "띄웠다 내리기"뿐이었다 — 준비 대기는 경쟁이 아니었고
(바인딩 `+1ms` vs 첫 요청 `+6451ms`), no-op 분기는 `docker:build` 가 갈라지며 쓸모가 없어졌다.

- [x] `pnpm build` / `pnpm start` 콜드 상태에서 동작 (15/15 태스크, `/checkout` 에 `주문서`)
- [x] host 이미지는 이 게이트를 타지 않는다 — 태스크 이름을 나눴다(`build` / `docker:build`).
      Dockerfile 이 플래그로 turbo.json 을 되돌리는 모양은 의도가 두 파일에 흩어져서 접었다
- [x] `REMOTE_*_SSR_ENTRY` 를 host Dockerfile `ARG` 로 명시 (빌드 시점에도 필요한 값이다)
- [x] `remote-version.ts` 의 `??` → `||` (빈 `ARG` 가 `new URL("")` 로 터질 자리였다)
- [x] compose 를 2단계로 분리 — 빌드 컨테이너는 compose 네트워크 밖이라 `host.docker.internal`
- [x] `.env.local` 이 캐시를 깨게 했다 (`inputs: ["$TURBO_DEFAULT$", ".env*"]`).
      gitignore 된 파일이 기본 입력에서 빠지는데, 그 파일이 프리렌더 결과를 정하고 있었다
- [x] 이어서 `apps/host/.env.local` 자체를 삭제 — 코드 기본값의 복사본이었다.
      로컬은 이제 환경변수 설정 없이 그냥 돈다
- [x] `pnpm start` 를 `pnpm build && turbo run start` 로 — 빌드 중 임시 서버와
      remote `start` 가 같은 포트를 동시에 잡으려다 둘 다 죽었다
- [x] `WAIT_FOR_REMOTES_TIMEOUT` 을 `globalEnv` 에 등록 — A-10 을 그대로 다시 밟았다.
      `=1` 을 줬는데 60초를 기다렸고, 등록 후 1.17초

부작용으로 진단이 하나 좋아졌다. dev 서버가 떠 있는 채로 빌드하면 정적 서버가 `::` 에
붙는 데 **성공해서** 15초를 버리고 엉뚱한 결론이 났는데, 띄우기 전에 TCP 로 포트 점유를
먼저 보게 해서 1초 만에 "dev 를 내리라"고 말한다.

## 2026-08-14 (5차) — Cache Components 이행 + MFA 캐시 실측

질문: **런타임 MF 를 쓰면 Next 의 ISR·Cache Components 를 잃는가?** → **아니오.**

전제 정정: Next 16 은 `dynamic` / `revalidate` / `fetchCache` 세그먼트 설정을
`use cache` + `cacheLife` 로 **대체**했다. 그래서 host 전체를 `cacheComponents: true` 로 이행했다.

### 한 일

- [x] host 전면 이행 — 세그먼트 설정 삭제, `connection()`+`<Suspense>` / `"use cache"`+`cacheLife` 로 재표현
- [x] `/lab` 실험 하네스 — 세 라우트가 같은 remote 를 렌더, 캐시 선언만 다름
- [x] `loader-stats` — remote 번들 fetch/eval 계측 (globalThis, RSC/SSR 레이어 공유)
- [x] `/api/lab/stats`, `/api/mf-revalidate` (remote 배포 → host 캐시 무효화 웹훅)
- [x] 캐시 스코프에 `cacheTag(remoteCacheTag(remote))` — 스코프가 의존 remote 를 자기 선언
- [x] **warm-then-revalidate** — 스켈레톤이 캐시에 굳는 위험 제거
  - 무효화 신호만 globalThis 로 공유, 캐시는 레이어별 유지(레이어마다 React 가 다르다)
  - `lazy()` 캐시 키에 remote 버전 반영 — 안 하면 무효화가 로더까지 닿지 않음
  - 번들 태그와 페이지 태그 분리 + 번들은 `{ expire: 0 }` 즉시 만료
  - warm 실패 시 페이지 캐시를 건드리지 않고 502 중단
- [x] **remote 버전 핀** — remote 가 `mf-version.json` 으로 버전 공표, host 는 그걸 읽어 수렴
  - 버전 = 빌드 ID(git SHA). 웹·SSR 산출물 **전부** `v<version>/` 불변 경로로 배포
  - 소스 변경 없는 재배포도 새 버전 — 운영성 초기화 배포에서 host 가 확실히 갈아탄다
  - 웹훅 없이도 인스턴스 전부 수렴(실측 30초 = TTL) → 브로드캐스트 불필요
  - 같은 버전을 서버 엔트리와 브라우저 양쪽에 적용 → 브라우저 요청 17/17 버전 경로, 콘솔 에러 0
  - 롤백 = `mf-version.json` 만 되돌리기 (자산 3개 버전 보존)
  - remote `start` 를 번들러 preview → 공용 정적 서버로 교체 (CDN 의미론: `/v*` immutable)
- [x] **remote 신뢰 경계** — 오리진 허용 목록 + 경로 검증 + SRI 무결성 + Ed25519 서명
  - 변조 6종을 실제로 시도해 전부 거부 확인 (거부하면서 서비스는 계속 뜬다)
  - warm 은 캐시를 믿지 않고 매번 다시 받아 다시 검증
  - 개인키는 remote CI, 공개키는 host — 같은 곳에 두면 막으려던 걸 못 막는다
- [x] `/internal/mf-warm` 인증 — middleware 상수시간 시크릿 검사
  - 페이지 안 `notFound()` 는 상태 코드를 못 바꾼다(레이아웃이 이미 flush됨) → middleware 필요

### 결과

| 판정                                   | 결과                                                                    |
| -------------------------------------- | ----------------------------------------------------------------------- |
| 캐시된 HTML 에 remote 마크업           | ✅ 있음 (빌드 프리렌더 · 런타임 재생성 모두)                            |
| 캐시 HIT 구간의 remote 번들 fetch/eval | ✅ **0 / 0** (동적 라우트는 1회차 1/1)                                  |
| TTFB                                   | 동적 74→9ms vs 캐시 5→2ms                                               |
| 태그만으로 무효화                      | ✅ 됨 — 단 `cacheTag()` 로 달아야 함. `fetch` 의 `next.tags` 로는 안 됨 |
| `revalidateTag` 동작                   | SWR — 1회 `STALE` 후 백그라운드 갱신 → 새 렌더                          |
| cacheComponents 이행 비용              | 대부분 MFA 무관 (`usePathname`·`params` → Suspense)                     |
| `generateStaticParams` 빈 배열         | ❌ 금지 → host 빌드는 remote 기동에 의존                                |
| 재생성 중 스켈레톤 캐싱                | ✅ 결정적 재현(4/4) 후 warm-then-revalidate 로 해결(0/4)                |

전문: [04-experiments/03-cache-modes.md](./04-experiments/03-cache-modes.md)

## 2026-08-14 (4차) — DTS 플러그인 검토 + 3차 오진 정정

### 오진 정정

3차에서 `[ dynamic-remote-type-hints-plugin ] err: [object Event]` 의 원인을
`dts` 로 지목했는데 **틀렸다.** 실제 스위치는 **`dev` 옵션**이다.

```js
// dts-plugin/dist/index.js — DevPlugin.apply()
if (!isDev() || normalizedDev === false) return; // dev 빌드에서만
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

| 설정                                                         | WS 플러그인 주입 | DTS 생성 |
| ------------------------------------------------------------ | ---------------- | -------- |
| `dts: true` (기본)                                           | **있음**         | 동작     |
| `dts: true` + `dev: { disableDynamicRemoteTypeHints: true }` | **없음**         | 동작     |
| `dts: false` (현재)                                          | 없음             | 안 함    |

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

| #   | 증상                                                       | 원인                                                                                                        | 조치                                                                                                              |
| --- | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| 1   | `[ dynamic-remote-type-hints-plugin ] err: [object Event]` | MF 의 `DevPlugin` 이 dev 빌드에서 주입하는 런타임 플러그인이 `ws://127.0.0.1:<port>` 연결 실패 시 콘솔 에러 | 두 remote 모두 `dts: false` (⚠️ 원인 진단은 4차에서 정정)                                                         |
| 2   | `_jsxDEV is not a function` (catalog 첫 로드 페이지에서만) | Vite dev 의 지연 optimizeDeps. remote 는 host 페이지 안에서 돌아 Vite 의 자동 새로고침이 오지 않음          | catalog 에 `optimizeDeps.entries` + `include` 지정해 기동 시 사전 번들링 (⚠️ 원인 진단은 8차에서 정정 — 재발했다) |

과정에서 오진으로 서브엔트리 공유를 제거했다가
`Failed to bridge external shared module "react-dom/client"` 를 만났다.
`@module-federation/vite` 는 서브엔트리를 shared 목록에 자동으로 올리므로 host 가 반드시 제공해야 한다.
대신 넘기는 값의 모양을 `apps/host/src/mf/interop.ts` 의 `normalizeModule()` 로 정규화했다
(브라우저 shared + 서버 로더 require 셰임 양쪽).

### 검증

| 검증                                                    | 결과                  |
| ------------------------------------------------------- | --------------------- |
| `/debug` → zone(하드) → 뒤로 → `/` → 뒤로 (dev)         | ✅ 콘솔 에러 0        |
| 동일 시나리오 (prod)                                    | ✅ 콘솔 에러 0        |
| catalog 첫 로드 순서 `/debug` → `/`                     | ✅ 상품카드 8, 에러 0 |
| SSR + 소프트 내비 전체 재검증 (dev/prod)                | ✅ 이전과 동일        |
| `grep -c dynamic-remote-type-hints dist/remoteEntry.js` | ✅ 0, 0               |
| build / lint / typecheck                                | ✅ 18/18              |

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

| 검증                             | 방법                        | 결과                                 |
| -------------------------------- | --------------------------- | ------------------------------------ |
| remote SSR — 상세                | `curl /products/kb-001`     | ✅ `Aurora 75` 초기 HTML 포함        |
| remote SSR — 결제                | `curl /checkout`            | ✅ `주문서` 초기 HTML 포함           |
| remote SSR — 장바구니            | `curl /cart`                | ✅ 셸 인라인                         |
| remote SSR — 홈                  | `curl /`                    | ✅ 동일 응답 내 포함(React 스트리밍) |
| 소프트 내비 `/`→`/checkout`      | Playwright document 요청 수 | ✅ **0건**                           |
| 소프트 내비 `/`→`/products/:id`  | 동일                        | ✅ **0건**                           |
| 하드 내비 `/`→`/legacy-checkout` | 동일                        | ✅ **1건** (대조군)                  |
| hydration                        | 브라우저 콘솔               | ✅ 에러/경고 **0건**                 |
| 크로스 remote 상태               | 담기 → 헤더 배지            | ✅ `0/0원` → `1/189,000원`           |
| build / lint / typecheck         | `turbo run`                 | ✅ 14/14 통과                        |

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

| 검증                                 | 결과                             |
| ------------------------------------ | -------------------------------- |
| host 가 Vite remote 소비             | ✅ 상품 카드 8개 렌더            |
| host 가 Rsbuild remote 소비          | ✅ 배지 + 패널 렌더              |
| React 단일 인스턴스 공유             | ✅ 콘솔 에러 0, share scope 3    |
| 번들러가 다른 두 remote 간 상태 공유 | ✅ `0/0원` → `1/189,000원`       |
| Multi-Zone rewrite                   | ✅ `:3000/checkout` 이 zone 응답 |
| zone 으로 장바구니 인계              | ✅ localStorage 복원             |
| `next build` 프로덕션 빌드           | ✅ host 5라우트 / zone 2라우트   |

### 당시 확인된 제약

- ~~remote UI 는 SSR 되지 않음~~ → **2차에서 해소**
- ~~zone 경계는 하드 내비게이션~~ → **2차에서 Multi-Zones 자체를 기각**
- TypeScript 는 7.0.2 대신 6.0.3 고정 (typescript-eslint peer 제약) — 유효

---

## 다음에 해볼 것

- [x] remote SSR 번들 신뢰 경계 — origin 허용목록 + SRI + Ed25519 서명 (5차)
- [x] remote 버전 핀/롤백 전략 — `/v<hash>/mf-server.cjs` 불변 경로 (5차)
- [x] remote 재배포 시 host 서버 캐시 무효화 경로 → `/api/mf-revalidate` + `cacheTag` (5차)
- [x] 무효화 시 remote 번들 선 warm → 스켈레톤 위험 제거 (5차 발견 6)
- [x] `/internal/mf-warm` 접근 제어 → middleware 시크릿 검사 (5차 발견 7)
- [x] CI 에서 MF 계약 검증 — 빌드 프리렌더가 remote SSR 번들을 실제로 실행한다 (9차)
- [x] remote 호출 제한 시간 + 실패 원인 구분 (9차)
- [ ] 캐시 스코프 없이 프리렌더되는 정적 라우트(`/` 등)의 무효화 경로 정리
- [~] remote 배포 파이프라인 시뮬레이션 — 배포 표면은 만들었다(6차). 무중단 재배포 실측은 남았다
- [ ] SSR 실패 시 CSR 폴백 — 서버 로드 실패해도 브라우저에서 재시도
- [ ] 초기 로딩 성능 측정 — SSR 경로의 TTFB / LCP 정량화
- [ ] 프레임워크 혼용 remote (Vue/Svelte)로 자유도 한계 확인
- [ ] 인증 토큰 공유 전략 (현재는 장바구니만 다룸) — `packages/store/src/auth/` 로 같은 모양 반복
- [ ] 상태 소유권을 cart remote 로 넘기는 안 — catalog 가 `onAddToCart` 콜백을 받고
      host 가 cart 로 배선한다 (ADR-013 의 기각 대안)
- [ ] `@module-federation/bridge-react` 로 remote 안에 자체 라우터 두는 패턴 검증
