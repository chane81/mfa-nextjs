# 구축 중 실제로 터진 문제들

전부 이 저장소를 세우면서 재현된 것들이다. 로그는 실제 출력.

## 증상으로 찾기

아래 본문은 **밟은 순서**(회차)대로 쌓여 있다. 지금 겪고 있는 증상에서 출발하려면 이 표를
쓴다. 순서대로 좁히는 절차가 필요하면 맨 끝의 [진단 체크리스트](#진단-체크리스트)로 간다.

### 설치 · 기동

| 증상                                                               | 항목                                                                                                                                                                                |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm install` 이 `@rspack/binding-*` 에서 멈춤 · 타임아웃         | [8](#8-pnpm-설치-중-rspack-바이너리-타임아웃)                                                                                                                                       |
| `ERR_PNPM_UNSUPPORTED_ENGINE` / `Expected version: >=24.19.0 <25`  | Node 가 범위 밖이다 — [실행 방법 › 요구사항](../03-setup/01-getting-started.md#요구사항)                                                                                            |
| 포트가 안 비어서 기동 실패 / 옛 빌드가 계속 응답                   | [0-1](#0-1-pkill--f-next-start-가-안-먹혀서-옛-빌드를-계속-테스트함), [B-4](#b-4-dev-서버가-떠-있으면-포트-충돌조차-안-난다), [B-4b](#b-4b-pnpm-start-가-자기-자신과-포트를-다툰다) |
| `Directory import … is not supported` / `Cannot find module './x'` | dist 를 raw Node 로 로드했다 — [D-1](#d-1-확장자-없는-상대-경로는-번들러에서만-풀린다)                                                                                              |

### `pnpm build` 실패

| 증상                                                                 | 항목                                                                                                                           |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `Error occurred prerendering page` + `fetch failed` / `ECONNREFUSED` | [B-1](#b-1-host-빌드는-remote-가-떠-있어야-끝난다), [1](#1-next-build-프리렌더가-mf-런타임을-호출해서-죽음)                    |
| `매니페스트에 무결성 값이 없습니다`                                  | 그 포트에 dev 서버가 떠 있다 — [B-4](#b-4-dev-서버가-떠-있으면-포트-충돌조차-안-난다)                                          |
| 빌드가 안 끝나고 매달림 (사이드카가 안 죽음)                         | [B-2](#b-2-turbo-의-with-사이드카로는-build-를-못-끝낸다), [B-3](#b-3-그-게이트를-host-이미지가-타면-안-된다-끊는-건-이름으로) |
| `new URL("")` / `Invalid URL`                                        | 빈 문자열 env — [B-5](#b-5-빈-문자열-env-가-new-url-로-터질-자리가-남아-있었다)                                                |
| Turbopack 이 상대경로 `.js` 를 못 찾음                               | [2](#2-turbopack-이-상대경로-js-확장자를-못-찾음)                                                                              |
| `@mfa/contracts` 빌드가 `window` 를 못 찾음                          | [7](#7-mfacontracts-빌드가-window-를-못-찾음)                                                                                  |
| 배포 빌드만 다른 경로로 통과함                                       | [B-6](#b-6-배포-빌드는-문서에-없는-경로로-통과하고-있었다)                                                                     |

### remote 가 안 뜨거나 깨짐

| 증상                                                       | 항목                                                                                                                                              |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `_jsxDEV is not a function` (dev, catalog 첫 로드)         | [0-4c](#0-4c-콜드-dev-첫-로드에서-_jsxdev-is-not-a-function)                                                                                      |
| `Invalid hook call` / React 2벌 로드                       | [0-3](#0-3-remote-서버-번들이-자기-react-를-들고-오면-서버에서도-훅이-깨진다), [0-4d](#0-4d-host-가-서브엔트리-공유를-빼면-vite-remote-가-깨진다) |
| `예상 밖 모듈을 require 했습니다`                          | 번들러 externals — [0-5](#0-5-shared-모듈-네임스페이스-interop)                                                                                   |
| `[ dynamic-remote-type-hints-plugin ] err: [object Event]` | [0-4b](#0-4b-dynamic-remote-type-hints-plugin-err-object-event)                                                                                   |
| `SSR 번들을 가져오지 못했습니다` / `ECONNREFUSED` (dev)    | remote 미기동. 살아있는데도 나면 [0-4](#0-4-dev-에서-ssr-번들이-안-내려옴)                                                                        |
| 배럴 import 가 Server Component 를 오염                    | [3](#3-공유-ui-패키지-배럴이-server-component-를-오염시킴)                                                                                        |

### SSR · hydration

| 증상                                                           | 항목                                                                            |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| 초기 HTML 에 remote 마크업이 없음                              | [0-4](#0-4-dev-에서-ssr-번들이-안-내려옴) + [진단 체크리스트](#진단-체크리스트) |
| `/` 만 스켈레톤이 먼저 나감                                    | [0-6](#0-6-만-스켈레톤이-먼저-나가는-현상)                                      |
| hydration 불일치                                               | [A-8](#a-8-버전-스크립트가-suspense-안에-있으면-hydration-이-깨진다)            |
| 서버 로더에 node builtin 을 썼더니 브라우저 번들이 깨짐        | [0-2](#0-2-서버-로더에-node-builtin-을-쓰면-브라우저-번들이-깨진다)             |
| 새로고침하면 장바구니 영역이 한 번 깜빡임                      | [E-1](#e-1-새로고침-때-장바구니가-깜빡인다--저장소가-느린-게-아니다)            |
| 깜빡임을 자리표시자로 가렸더니 더 심해짐                       | [E-2](#e-2-자리표시자로-가리면-더-나빠진다)                                     |
| `blocking-prerender-dynamic` 빌드 에러                         | [E-3](#e-3-쿠키를-suspense-밖에서-읽으면-빌드가-멈춘다)                         |
| 안 쓰는 패키지가 브라우저 번들에 실림                          | [E-4](#e-4-use-client-를-재수출하는-배럴은-서버에서-써도-브라우저로-따라온다)   |
| `Encountered a script tag while rendering React component`     | [E-5](#e-5-서버-표면에-use-client-가-붙으면-dev-콘솔에서만-터진다)              |
| `Attempted to call X() from the server but X is on the client` | [E-5](#e-5-서버-표면에-use-client-가-붙으면-dev-콘솔에서만-터진다)              |

### 스타일 · CSS

| 증상                                                | 항목                                                                           |
| --------------------------------------------------- | ------------------------------------------------------------------------------ |
| dev 에서만 remote 가 무스타일 (`/style.css` 는 200) | [C-1](#c-1-dev-에서-vite-remote-의-css-를-브라우저가-통째로-무시한다)          |
| `@mfa/ui` 컴포넌트만 무스타일 · 빌드는 성공         | [C-2](#c-2-mfaui-의-클래스가-css-에서-조용히-빠진다)                           |
| 배포에서 스타일시트가 `localhost` 를 가리킴         | [C-3](#c-3-브라우저에서-만든-스타일시트-주소가-배포에서-localhost-를-가리킨다) |

### 캐시 · 버전 · 재배포

| 증상                                        | 항목                                                                                                                                                                                     |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 재배포했는데 옛 remote 가 계속 나옴         | [A-2](#a-2-lazy-가-옛-remote-를-프로세스-수명-내내-고정한다), [A-3](#a-3-revalidatetag-를-하나만-쓰면-순서를-못-만든다), [A-4](#a-4-fetch-의-nexttags-는-use-cache-엔트리를-깨지-않는다) |
| 무효화 직후 스켈레톤이 캐시에 굳음          | [A-1](#a-1-재생성-중-스켈레톤이-캐시에-굳는다)                                                                                                                                           |
| warm 은 성공했다는데 실제론 옛 버전         | [A-6](#a-6-warm-성공-판정을-두-번-틀렸다), [A-7](#a-7-버전-정보를-재구성하면-필드가-사라진다)                                                                                            |
| 옛 버전 자산을 지웠더니 캐시된 HTML 이 죽음 | [A-9](#a-9-옛-버전-자산을-지우면-캐시된-html-이-죽는다)                                                                                                                                  |
| `notFound()` 를 불렀는데 상태 코드가 200    | [A-5](#a-5-페이지-안-notfound-는-상태-코드를-못-바꾼다)                                                                                                                                  |

### 환경변수 · turbo 캐시

| 증상                                      | 항목                                                                                                                                                      |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| env 를 바꿨는데 조용히 무시됨             | `turbo.json` 의 `globalEnv` 미등록 — [A-10](#a-10-turbo-가-등록-안-된-환경변수를-걸러낸다), [B-8](#b-8-a-10-을-또-밟았다-wait_for_remotes_timeout-미등록) |
| `.env.local` 을 바꿨는데 옛 빌드가 복원됨 | [B-7](#b-7-envlocal-을-바꿔도-turbo-캐시가-안-깨진다)                                                                                                     |

### lint · 툴체인

| 증상                                            | 항목                                                                                  |
| ----------------------------------------------- | ------------------------------------------------------------------------------------- |
| `eslint-plugin-react` 가 ESLint 10 에서 크래시  | [4](#4-eslint-plugin-react-7375-가-eslint-10-에서-크래시)                             |
| `react-hooks@7` 이 렌더 중 컴포넌트 생성을 막음 | [5](#5-react-hooks7-렌더-중-컴포넌트-생성-금지)                                       |
| `@next/next/no-html-link-for-pages` 오탐        | [6](#6-multi-zone-경계에서-nextnextno-html-link-for-pages-오탐-앱-삭제됨) (앱 삭제됨) |

## E. (13차) 장바구니를 쿠키로 옮기며 밟은 것

### E-1. 새로고침 때 장바구니가 깜빡인다 — 저장소가 느린 게 아니다

`persist` + `localStorage` 를 쓰니 "저장소를 읽는 동안 비어 보이는 것"이라고 오진했다.
아니다. zustand 문서(5.0.15)가 명시한다 — **동기 저장소면 스토어 생성 시점에 복원이 끝나 있다.**

> With synchronous hydration, the Zustand store will already have been hydrated at its creation.

늦는 쪽은 React 다. `useStore` 는 하이드레이션 렌더에서 **서버 스냅샷**
(`getInitialState()` = `lines: []`)을 쓴다. 서버 HTML 과 첫 클라이언트 렌더가 달라지면
안 되기 때문이다. 즉 **이미 아는 값을 일부러 한 프레임 안 쓴다.**

CDP 로 rAF 마다 표본을 뜨면 이렇게 보인다(항목 3개, 프로덕션 빌드).

```
  t(ms)  badgeW  panelBodyH
    9.2    97.8         0     ← 서버 스냅샷. 빈 장바구니
   34.6    97.8         0     ← 하이드레이션 커밋 직전
   51.2   187.6     206.5     ← 한 프레임에 두 자리가 튄다
```

**깜빡임의 정체는 색이 아니라 층 이동이다.**

진단할 때 헷갈리지 않는 방법: 저장소를 의심하지 말고 `useCart.getState().lines` 를 첫
스크립트에서 찍어 본다. 이미 들어 있다.

근본 원인은 **저장 위치**다. localStorage 는 브라우저에만 있어 서버가 모르고, 서버가
모르면 첫 HTML 은 반드시 비어 있다. 쿠키로 옮겨야 사라진다(ADR-014).

### E-2. 자리표시자로 가리면 더 나빠진다

E-1 을 "값이 준비될 때까지 가린다"로 풀려다 두 번 실패했다.

1. **스켈레톤** — 회색 상자가 "로딩 중"이 아니라 **번쩍임**으로 읽혔다. 한 프레임 남짓
   보이는 것에 로딩 UI 를 붙이면 없는 것보다 시끄럽다. 스켈레톤 1줄 대 실제 2줄이라
   층 이동이 오히려 하나 늘었다.
2. **색 없는 자리표시자** — 소리는 줄었는데 크기가 여전히 안 맞았다. 당연하다.
   **줄 수는 서버도, 첫 클라이언트 렌더도 모른다.** 자리 크기를 실제와 맞추는 건 원리상 불가능하다.

가려서 될 문제가 아니었다. 서버가 값을 알아야 끝난다.

### E-3. 쿠키를 Suspense 밖에서 읽으면 빌드가 멈춘다

`cacheComponents` 가 켜진 상태에서 페이지 본문에 `cookies()` 를 넣으면 빌드가 실패한다.

```
Error: Route "/cart": Next.js encountered uncached or runtime data during prerendering.
`fetch(...)`, `cookies()`, `headers()`, `params`, `searchParams`, or `connection()`
accessed outside of `<Suspense>` prevents the route from being prerendered…
```

문서에는 "프리렌더되지 않는다"고만 적혀 있어 **경고인 줄 알기 쉽지만 빌드 에러다.**
Cache Components 는 모든 페이지가 비어 있지 않은 정적 셸을 만드는지도 검증하기 때문이다.

에러 메시지가 세 가지 길을 준다.

| 길                             | 이 저장소에서                                               |
| ------------------------------ | ----------------------------------------------------------- |
| `<Suspense>` 로 감싼다         | ❌ 장바구니가 스트리밍으로 늦게 와 없애려던 전이가 돌아온다 |
| `"use cache"` 로 캐시한다      | ❌ 요청마다 다른 값이라 캐시 대상이 아니다                  |
| `export const instant = false` | ⭕ 블로킹 라우트를 허용하는 공식 통로                       |

`instant = false` 는 **루트 레이아웃이 아니라 그 페이지에만** 건다. 문서가
"as low as possible" 이라고 못박는데, 위에 걸면 그 아래 전부가 정적 셸 검증에서
빠지기 때문이다 — 여기서는 `/lab` 의 캐시 실험이 검증을 잃는다.

`dynamic = 'force-dynamic'` 은 답이 아니다. `cacheComponents` 와 함께 쓰면 컴파일이
막힌다(known-issues 의 세그먼트 설정 항목과 같은 규칙).

### E-4. `'use client'` 를 재수출하는 배럴은 서버에서 써도 브라우저로 따라온다

쿠키 코덱을 `@mfa/store` 로 옮기면서 `cart/index.ts` 배럴에 얹고, host 의 **서버 전용**
모듈에서 `import { parseCartCookie } from '@mfa/store'` 로 꺼냈다. 배럴이 재수출하는
`create-store.ts` 에는 `'use client'` 가 붙어 있으니 Next 가 서버 그래프에서 클라이언트
참조로 바꿔 평가하지 않는다 — 거기까지는 맞았다.

**그런데 평가되지 않는 것과 전송되지 않는 것은 다르다.** 클라이언트 참조가 되었다는 건
"브라우저가 이 모듈을 받는다"는 뜻이다.

```
apps/host/.next/static/chunks/2ch43vbu-qx5a.js   21.8KB (gzip 9.1KB)
  → zustand + 장바구니 스토어 전체
  → 참조하는 페이지: _not-found · debug · lab   ← 장바구니가 없는 화면들
```

host 는 `useCart` 를 **한 번도 부르지 않는다.** 순수 함수 두 개를 꺼내려고 배럴을 탄
대가로 상태 라이브러리가 통째로 따라왔다.

확인 방법:

```bash
grep -rl "zustand" apps/host/.next/static --include='*.js'
```

빌드 성공으로는 안 잡힌다. 타입도 린트도 통과한다. **번들을 직접 봐야 보인다.**

고친 방법은 `package.json` 의 **`react-server` export 조건**이다. RSC 그래프는
`'use client'` 를 재수출하지 않는 `dist/server.js` 로, 나머지는 기존 배럴로 간다.
소비처의 import 문(`@mfa/store`)은 그대로다.

전용 서브패스(`@mfa/store/cart-cookie`)를 내는 방법도 되지만 **이름을 지어내야 해서**
도메인이 늘면 `package.json` 이 지저분해진다. 조건부 export 는 진입점을 안 늘린다.

조건이 원인이라는 건 **대조군으로 확인**했다 — 조건만 빼고 같은 코드로 빌드하면
21,817바이트가 그대로 돌아온다. Turbopack 의 해석기는 Rust 라 소스 grep 으로는 못 본다.

⚠️ 이 방식은 서버 코드에서 훅을 import 해도 **`tsc` 를 통과한다**(타입은 `default` 조건으로
해석된다). `next build` 가 `Export useCart doesn't exist in target module ... [app-rsc]` 로
잡는다. 근거: ADR-015

### E-5. 서버 표면에 `'use client'` 가 붙으면 dev 콘솔에서만 터진다

E-4 를 고치며 만든 `packages/store/src/server.ts` **1행에 `'use client'` 가 박혀 있었다.**
파일 자신의 주석이 "여기서는 `'use client'` 모듈을 재수출하지 않는다"인데 정작 자기가
클라이언트 모듈이었다. 결과는 브라우저 콘솔의 이 두 줄이다.

```
Attempted to call parseCartCookie() from the server but parseCartCookie is on the client.
  #1 [Server Component]: ./apps/host/src/lib/cart-cookie.ts → SiteHeaderSlot → layout.tsx

Encountered a script tag while rendering React component.
Scripts inside React components are never executed when rendering on the client.
  src/app/layout.tsx (29:9) @ RootLayout    ← <RemoteVersionSync />
```

**두 번째 줄이 첫 번째 줄의 증상이다.** 순서는 이렇다.

1. 서버 표면이 클라이언트 모듈이라 `readCartLines()` 가 프리페치 렌더 패스(`env: "Prefetch"`)
   에서 던진다.
2. 그 패스가 실패한 라우트는 셸을 못 만들고 **레이아웃 subtree 가 클라이언트에서 렌더**된다.
3. `RemoteVersionSync` 가 내보내는 인라인 `<script>` 가 클라이언트에서 만들어진다.
   React 는 그런 스크립트를 실행하지 않으므로 경고를 낸다.

그래서 **`instant = false` 인 동적 라우트(`/`·`/cart`·`/checkout`)에만** 스크립트 경고가
보였고, PPR 로 프리렌더되는 `/lab`·`/debug` 는 조용했다. 스크립트 경고만 보고
`RemoteVersionSync` 나 `next/script` 를 고치려 들면 **엉뚱한 곳을 판다** — 원인은
레이아웃이 아니라 패키지의 export 표면이다.

증상으로 구분하는 법: 라우트마다 첫 HTML 을 받아 RSC 에러가 실려 있는지 본다.

```bash
curl -s http://localhost:3000/lab | grep -c "is on the client"
```

`/lab` 처럼 **경고가 안 보이는 라우트에서도** 이 수는 0 이 아니었다. 콘솔 경고는 증상이
드러난 라우트에만 나지만 원인은 전 라우트에 있었다는 뜻이다.

**왜 오래 안 보였나** — 타입 · 린트 · `pnpm build` 가 전부 통과한다. 빌드가 잡는 건
반대 방향(서버 표면에 **없는** export 를 서버에서 부르는 경우)뿐이다. 이쪽은 export 가
있긴 있고 종류만 클라이언트 참조라 정적 검사에 안 걸린다.

고친 방법은 그 한 줄을 지우는 것이고, 재발은 **린트로 막았다** —
`packages/store/eslint.config.js` 가 `src/server.ts` 한정으로 그 디렉티브를 금지한다.
ADR-015 가 "이 불변식을 지키는 건 주석뿐"이라고 적어둔 자리를 메운 것이다.

## D. (11차) 상태 패키지(`@mfa/store`)에서 밟은 것

### D-1. 확장자 없는 상대 경로는 번들러에서만 풀린다

파일을 합치면서 배럴의 재-export 하나가 확장자를 잃었다. `pnpm typecheck` 도
`pnpm lint` 도 `pnpm build` 도 **전부 통과했고**, dist 를 Node 로 직접 로드할 때만 터졌다.

```
Cannot find module '…/packages/store/dist/cart/create-store'
  imported from …/packages/store/dist/cart/index.js
```

디렉터리를 가리키면 메시지가 한 번 더 바뀐다.

```
Directory import '…/packages/store/dist/cart' is not supported resolving ES modules
  imported from …/packages/store/dist/index.js
```

**원인**은 셋이 겹친 것이다.

1. `tsc` 는 import 경로를 **재작성하지 않는다.** 소스에 적은 문자열이 그대로 산출물에 남는다.
2. 이 저장소의 tsconfig 는 `moduleResolution: "bundler"` 라 확장자 생략을 **허용**한다.
   그래서 타입체크가 통과한다.
3. 산출물은 `"type": "module"` 인 Node ESM 이다. Node 의 ESM 리졸버는 확장자 자동 추가도,
   디렉터리 `index` 자동 탐색도 하지 않는다.

즉 **번들러로 소비하면 멀쩡하고 Node 로 직접 로드할 때만 깨진다.** 그래서 CI 가 못 잡는다.

**결정**: 상대 경로에서 확장자를 **생략한다**(저장소 전역). 판단 기준은 "raw Node 가 이 파일을
여느냐" 하나이고, 지금은 모든 소비가 번들러를 거친다.

| 코드                                | 확장자 | 근거                                                                                |
| ----------------------------------- | ------ | ----------------------------------------------------------------------------------- |
| `@mfa/store`                        | 생략   | catalog(Vite)·cart(Rsbuild)만 소비한다                                              |
| `@mfa/contracts` · `@mfa/ui`        | 생략   | host 가 `transpilePackages` 로 **직접 번들**한다(externalize 되지 않는다)           |
| remote 앱 소스(`apps/remote-*/src`) | 생략   | Vite·Rsbuild 가 번들한다                                                            |
| host 앱 내부(`apps/host/src`)       | 생략   | Turbopack 이 `.js` 를 못 찾는다 — [2](#2-turbopack-이-상대경로-js-확장자를-못-찾음) |
| `@mfa/remote-config`                | `.js`  | **예외** — `vite.config.ts`·`scripts/*.ts` 를 Node 가 직접 읽는다                   |

실측: 전 패키지 생략 상태에서 typecheck 11/11, lint 11/11, build 6/6, host 프리렌더 정상.
워크스페이스 패키지는 remote SSR 번들(`mf-server.cjs`)에 **인라인된다** —
`require("@mfa/…")` 가 하나도 남지 않는 것으로 확인했다.

**재발 조건**은 둘이다.

- 워크스페이스 패키지를 host 의 `transpilePackages`(`apps/host/next.config.ts`)에서 빼면,
  Next 가 그걸 externalize 해서 raw Node ESM 해석으로 떨어진다. `@mfa/store` 를 host 서버에서
  import 하는 경우도 같다 — 지금 그 패키지는 목록에 없다.
- `scripts/*.ts` 처럼 Node 가 직접 실행하는 코드에서 워크스페이스 패키지를 import 하는 경우.
  지금은 `@mfa/remote-config` 만 그렇고, 그래서 그 패키지만 확장자를 지킨다.

둘 중 하나가 생기면 확장자를 도로 붙이거나 dist 를 번들로 낸다.

## C. (10차) Tailwind 를 붙이면서 밟은 것들

스타일 계약 자체는 [02-architecture/05-styling.md](../02-architecture/05-styling.md) 에 있다.
여기는 **틀렸을 때 어떻게 보이는지**만 적는다. 셋 다 공통점이 하나 있다 —
**에러가 안 난다.** 빌드도 통과하고 콘솔도 조용한데 화면만 무너진다.

### C-1. dev 에서 Vite remote 의 CSS 를 브라우저가 통째로 무시한다

증상: `pnpm build` 로는 멀쩡한데 `pnpm dev` 에서만 catalog 영역이 무스타일이다.
Network 탭에서 `http://localhost:3001/style.css` 는 **200** 이고, 콘솔 에러는 없다.

원인: dev 의 Vite 는 CSS 를 파일로 내보내지 않는다. HMR 을 위해 `<style>` 을 주입하는
**JS 모듈**로 감싸서 서빙한다. host 는 dev 든 배포든 똑같이
`<link rel="stylesheet">` 를 거는데(`RemoteComponent`), 브라우저는 스타일시트 자리에서
받은 JavaScript 를 파싱하지 못하고 그냥 버린다 — 그게 에러가 아니라 정상 동작이다.

해결: dev 전용 미들웨어가 `/style.css` 를 Vite 의 내부 쿼리 `?direct` 로 한 번 대신
요청해 JS 래퍼를 벗기고 `text/css` 로 돌려준다. 주소 하나로 dev 와 배포가 같아진다.

```ts
// apps/remote-catalog/vite.config.ts — serveDevStylesheet()
server.transformRequest('/src/styles.css?direct').then((result) => {
  res.setHeader('Content-Type', 'text/css; charset=utf-8');
  res.setHeader('Access-Control-Allow-Origin', '*'); // host(3000) 가 교차 출처로 받아간다
  res.end(result.code);
});
```

cart(Rsbuild)는 해당 없다. dev 에서도 CSS 를 실제 파일로 낸다 —
`output.distPath.css: ''` + `filename.css` 로 위치와 이름만 계약에 맞춰 뒀다.

### C-2. `@mfa/ui` 의 클래스가 CSS 에서 조용히 빠진다

증상: 앱 소스에 직접 쓴 클래스는 먹는데 `@mfa/ui` 컴포넌트만 무스타일이다.
빌드는 성공한다. 생성된 CSS 를 열어 보면 해당 유틸리티가 아예 없다.

원인: Tailwind v4 의 자동 소스 탐지는 `node_modules` 를 훑지 않는다. `@mfa/ui` 는
pnpm 워크스페이스 링크라 앱 입장에서 `node_modules` 안에 있다.

해결: `packages/tailwind-config/theme.css` 가 `@source '../ui/src'` 로 한 번 지정해
세 앱에 모두 적용한다(경로는 그 CSS 파일 위치 기준). 대신 자동 탐지의 기준점이
워크스페이스 링크 안의 `theme.css` 가 되므로, **앱 진입 CSS 가 자기 소스를 다시
지정해야 한다**(`@source '.'` / `@source '../'`).

같은 함정의 다른 얼굴: 클래스 이름을 `bg-${variant}` 처럼 조립하면 소스 스캔이 못 찾아
똑같이 빠진다. `packages/ui` 의 `Button` 은 variant 별 클래스를 완성된 문자열로 나열한다.

### C-3. 브라우저에서 만든 스타일시트 주소가 배포에서 `localhost` 를 가리킨다

증상: 로컬은 멀쩡한데 배포에서 remote 스타일시트만 안 뜬다. HTML 을 보면
`<link href="http://localhost:3001/...">` 가 박혀 있다.

원인: `publicOrigin()` 은 `process.env[이름]` 을 **동적으로** 읽는다. Next 는 정적
`process.env.X` 만 치환하므로 브라우저 번들에서는 값이 남지 않고 로컬 기본값으로 떨어진다.
`SSR_ENTRIES` 에서 오리진을 뽑는 경로도 같은 이유로 서버 전용이다.

해결: `RemoteComponent` 는 `REMOTE_ORIGINS` 를 쓴다. 이 값은 `next.config.ts` 가 node 에서
꺼내 번들에 구워 넣은 `WEB_ENTRIES` 에서 나오므로 브라우저에서도 배포 오리진을 가리키고,
서버 렌더와 값이 같아 하이드레이션도 어긋나지 않는다.

```tsx
// apps/host/src/mf/RemoteComponent.tsx
href={`${REMOTE_ORIGINS[remoteName]}${stylesPath(knownVersion(remoteName)?.version)}`}
```

---

## B. (6차) 로컬에서 `pnpm build` 가 안 됐다

### B-1. host 빌드는 remote 가 **떠 있어야** 끝난다

```
Error occurred prerendering page "/_not-found"
TypeError: fetch failed
    at async E (src/mf/server-loader.ts:167:15)
  [cause]: AggregateError: ... code: 'ECONNREFUSED'
```

배포에서는 remote 가 이미 공개 도메인에 떠 있어서 안 보이던 요구사항이다. 로컬에는
그걸 서빙하는 게 없다. `turbo run build` 는 host 와 remote 를 **동시에** 돌리므로
빌드 순서를 맞춰도 이건 안 풀린다 — 필요한 건 "먼저 빌드"가 아니라 **"떠 있는 상태"** 다.

`RemoteBoundary` 는 못 막는다. 런타임 장애는 에러 박스로 격리되지만 프리렌더에서
던져진 에러는 **빌드 실패**다. 실측으로 확인했다.

### B-2. turbo 의 `with` 사이드카로는 `build` 를 못 끝낸다

turbo 공식 패턴은 `with`(동시 실행) + 유한 readiness 프로브다.
([coordinating-runtime-dependencies](https://turborepo.dev/docs/guides/coordinating-runtime-dependencies))
그대로 넣어보면 **순서도 준비 대기도 정확히 동작한다.**

```
@mfa/remote-cart:serve:      [serve-dist] :3002 → .../apps/remote-cart/dist
@mfa/remote-cart:serve:ready: ready 3002
@mfa/host:build:             ✓ Generating static pages (14/14)
```

그런데 **`turbo run build` 가 종료하지 않는다.** 사이드카가 `persistent: true` 라
host 빌드가 끝나도 죽지 않는다. 문서도 "중단 시(Ctrl-C) 모든 태스크를 종료한다"고 쓴다 —
그 패턴은 `dev` 용이지 반드시 exit 해야 하는 `build` 용이 아니다.

| 조각                | turbo 가 되나                   |
| ------------------- | ------------------------------- |
| remote 를 먼저 빌드 | O — `@mfa/host#build.dependsOn` |
| 준비될 때까지 대기  | O — 유한 프로브 태스크          |
| **끝나면 내리기**   | **X**                           |

순수 turbo 로 가는 다른 변형은 더 나쁘다. `serve` 태스크가 서버를 detach 하고 즉시 exit 하면
그래프는 깔끔해지지만 아무도 안 죽여서 3001/3002 에 남고, 다음 `pnpm dev` 가 포트 충돌한다.

그래서 마지막 한 걸음은 host 의 `build` 스크립트가 처리한다. 처음엔 전용 래퍼 스크립트를
썼다가(`scripts/with-remote-dist.mjs`, 221줄) `concurrently` 한 줄로 접었다.

```jsonc
"build": "concurrently --kill-others --success first -n catalog,cart,next \
  \"node ../../scripts/serve-remote-dist.mjs 3001 ../remote-catalog/dist\" \
  \"node ../../scripts/serve-remote-dist.mjs 3002 ../remote-cart/dist\" \
  \"next build\""
```

래퍼가 하던 일 중 실제로 필요했던 건 "띄웠다 내리기"뿐이었다. 나머지는 전부 뺐다.

| 래퍼가 하던 일           | 왜 뺐나                                                    |
| ------------------------ | ---------------------------------------------------------- |
| 준비될 때까지 폴링       | 경쟁이 아니었다 — 바인딩 `+1ms` vs 첫 요청 `+6451ms`(실측) |
| 이미 뜬 오리진이면 no-op | 이미지가 `docker:build` 로 갈라져서 이 스크립트를 안 탄다  |
| `.env.local` 파싱        | 그 파일이 코드 기본값을 그대로 다시 적은 것이라 삭제했다   |
| dev 점유 감지            | 무결성 에러로 죽는다. 힌트를 그 에러 메시지에 넣었다       |

### B-3. 그 게이트를 host 이미지가 타면 안 된다 — 끊는 건 **이름**으로

`--filter=@mfa/host` 는 `dependsOn` 의 `pkg#task` 를 **필터와 무관하게** 끌고 온다.

```
$ pnpm turbo run build --filter=@mfa/host --dry=json
  - @mfa/host#build
  - @mfa/remote-cart#build      ← 이미지 안에서 쓰지도 않을 remote 를 빌드한다
  - @mfa/remote-catalog#build
```

문제는 낭비가 아니라 **커플링**이다. 이렇게 두면 catalog 빌드가 깨질 때 host 배포까지
같이 깨진다. 이 저장소가 증명하려는 독립 배포가 빌드 그래프에서 다시 묶이는 것이다.

처음엔 Dockerfile 에서 플래그로 끊었다.

```dockerfile
RUN pnpm turbo run build --filter='@mfa/host^...' \
 && pnpm turbo run build --filter=@mfa/host --only
```

동작은 하는데 **의도가 두 파일에 흩어진다.** turbo.json 이 의존을 걸고 Dockerfile 이
그걸 되돌리는 모양이라, 읽는 사람이 두 곳을 대조해야 뜻이 잡힌다.

지금은 태스크 이름을 나눈다. 같은 산출물, 게이트만 다르다.

| 태스크                   | remote 게이트      | 쓰는 곳                           |
| ------------------------ | ------------------ | --------------------------------- |
| `@mfa/host#build`        | 있음               | 로컬 (`pnpm build`, `pnpm start`) |
| `@mfa/host#docker:build` | 없음 (`^build` 만) | `apps/host/Dockerfile`            |

```dockerfile
RUN pnpm turbo run docker:build --filter=@mfa/host
```

플래그로 되돌릴 게 없어졌다. "이미지는 remote 를 안 빌드한다"가 태스크 정의 한 곳에만 있다.

### B-4. dev 서버가 떠 있으면 포트 충돌조차 안 난다

정적 서버가 `:3001` 에 뜨는 데 **성공한다.** Vite dev 가 `127.0.0.1` 에 바인딩하면
우리 서버는 `::` 에 붙을 수 있어서, 요청은 계속 dev 로 가는데 우리 프로세스는 멀쩡히 산다.
"포트가 겹치면 EADDRINUSE 로 알려주겠지"가 성립하지 않는다.

빌드는 죽는다 — dev 는 `mf-version.json` 을 공표하지 않으므로 무결성 값 없는 폴백 엔트리로
흘러가서 거부된다. 다만 그 메시지만으로는 원인이 안 보인다. 그래서 힌트를 에러에 넣었다.

```
Error: remote 'catalog' 매니페스트에 무결성 값이 없습니다.
       그 오리진에 dev 서버가 떠 있지 않은지 확인하세요 — 빌드는 dev 가 아니라 dist 를 서빙해야 합니다.
```

### B-4b. `pnpm start` 가 자기 자신과 포트를 다툰다

`turbo run start` 만 부르면 `@mfa/host#build`(빌드 중 3001/3002 에 정적 서버를 띄운다)와
`@mfa/remote-*#start`(같은 포트)가 **동시에** 스케줄된다. `start` 는 자기 패키지의 `build`
만 기다리기 때문이다. 둘 다 EADDRINUSE 로 죽는다.

```
[cart] node .../serve-remote-dist.mjs 3002 ... exited with code 1
--> Sending SIGTERM to other processes..
[next] next build exited with code 143
```

- **해결**: 루트 `start` 를 `pnpm build && turbo run start` 로 둔다. 빌드를 먼저 끝내두면
  두 번째 turbo 호출에서 host 빌드가 **캐시 히트라 실행되지 않고**, 따라서 임시 서버도
  안 뜬다. remote 만 포트를 잡는다.

> 아래 B-5 ~ B-7 에 나오는 `REMOTE_*_SSR_ENTRY` 는 **이후 `REMOTE_*_PUBLIC_URL` 로 통합됐다**
> (오리진만 env 로 받고 파일명은 코드가 붙인다 — `docs/03-setup/03-environment.md`).
> 이름만 바뀌었고 아래 함정은 전부 그대로 유효하다. 당시 기록이라 이름은 그대로 둔다.

### B-5. 빈 문자열 env 가 `new URL("")` 로 터질 자리가 남아 있었다

`REMOTE_*_SSR_ENTRY` 를 Dockerfile `ARG` 로 받게 하면서 드러났다.

```ts
process.env.REMOTE_CATALOG_SSR_ENTRY ?? 'http://localhost:3001/mf-server.cjs';
```

값 없는 `ARG` 는 `ENV VAR=""` 로 도착하고, `??` 는 빈 문자열을 유효한 값으로 받는다.
`docs/03-setup/04-dokploy.md` 에 이미 같은 함정을 적어뒀는데 이 자리를 빠뜨렸다. `||` 로 고침.

### B-6. 배포 빌드는 문서에 없는 경로로 통과하고 있었다

로컬에서 실패하는 빌드가 Dokploy 에서는 14/14 프리렌더에 성공했다. 빌드 로그를 보고 알았다.

```
#23 5.984 @mfa/host:build: - Environments: .env
```

Dokploy 의 `Create Environment File` 이 런타임 env 를 `.env` 로 만들어 빌드에 넣어주고 있었다.
그래서 빌드 인자에 `REMOTE_*_SSR_ENTRY` 가 없는데도 프리렌더가 remote 에 닿았다.

**동작하는데 재현이 안 되는 상태**였다. 저장소 어디에도 안 적힌 우회로라 로컬·compose·다른
PaaS 에서 전부 깨진다. Dockerfile `ARG` 로 드러내고 빌드 인자로 명시해 넘기도록 바꿨다.

> 부작용 주의: `ARG` 를 선언했으므로 이제 빌드 인자를 **안 넣으면** `ENV VAR=""` 가 `.env`
> 보다 우선해서 빌드가 깨진다(Next 는 이미 설정된 `process.env` 를 `.env` 로 덮지 않는다).
> 그래서 Dockerfile 변경과 Dokploy 빌드 인자 추가는 같이 가야 한다.

### B-7. `.env.local` 을 바꿔도 turbo 캐시가 안 깨진다

`REMOTE_*_SSR_ENTRY` 를 바꾸면 프리렌더 결과가 달라진다 — 어느 오리진에서 SSR 번들을 받아
마크업을 만들지가 그 값에서 나오기 때문이다. 그런데 캐시는 그대로였다.

```
$ pnpm turbo run build --filter=@mfa/host      →  FULL TURBO
$ echo '# probe' >> apps/host/.env.local
$ pnpm turbo run build --filter=@mfa/host      →  FULL TURBO   ❌ 옛 .next 복원
```

turbo 의 기본 입력 집합은 **git 이 추적하는 파일**이다. `.env.local` 은 gitignore 라 빠진다.
`globalEnv` 도 못 막는다 — turbo 가 보는 건 프로세스 env 이고, `.env.local` 은 태스크 **안에서**
Next 가 읽기 때문에 turbo 에게는 보이지 않는다.

```jsonc
"@mfa/host#build": { "inputs": ["$TURBO_DEFAULT$", ".env*"], ... }
```

`$TURBO_DEFAULT$` 는 기본 집합을 유지하면서 덧붙이라는 뜻이다. 이걸 빼고 `.env*` 만 적으면
소스 변경이 캐시를 못 깨는 정반대의 사고가 난다.

> 그 뒤 `apps/host/.env.local` 자체를 지웠다. 코드 기본값을 한 글자도 안 틀리게 다시 적은
> 파일이라 얻는 게 없었다. `inputs` 는 남겨둔다 — 누가 다시 만들면 그 순간 일한다.

### B-8. A-10 을 또 밟았다 — `WAIT_FOR_REMOTES_TIMEOUT` 미등록

```
$ time WAIT_FOR_REMOTES_TIMEOUT=1 pnpm turbo run dev:wait-remotes --force
[wait-remotes] catalog 가 60000ms 안에 응답하지 않았습니다.
  → 1:00.86 total          ❌ 1ms 를 줬는데 60초를 기다렸다
```

`globalEnv` 에 없으면 turbo 가 태스크 환경에서 지운다. **에러도 경고도 없다**(A-10 과 같은 함정).
lint 규칙 `turbo/no-undeclared-env-vars` 도 못 잡는다 — 그 변수를 읽는 게 앱 소스가 아니라
`scripts/` 아래 파일이라 lint 대상이 아니다.

등록 후 `1.17s`. **`scripts/` 에서 새 env 를 읽기 시작하면 `globalEnv` 를 같이 본다.**

---

## A. (5차) 캐시 · 버전 · 신뢰 경계에서 밟은 것들

전부 **조용히 잘못 동작하는** 부류였다. 빌드는 통과하고 화면도 멀쩡한데 결과가 틀리다.

### A-1. 재생성 중 스켈레톤이 캐시에 굳는다

remote 를 기다리는 동안 Suspense fallback 이 캐시 엔트리로 저장되고, 그 뒤로 계속
`x-nextjs-cache: HIT` 로 서빙된다. 화면에는 영원히 스켈레톤만 남는다.

- **조건**: 콜드 프로세스 + 느린 remote 응답 + 페이지 캐시 무효화
- **재현**: remote SSR 엔트리 앞에 800ms 지연 프록시를 두고 `.next/cache/fetch-cache` 삭제 후 무효화
- **해결**: warm-then-revalidate — 번들을 먼저 데우고 **그 뒤에** 페이지 캐시를 깬다.
  warm 실패 시 페이지 캐시를 건드리지 않고 502 로 중단(옛 화면이 스켈레톤보다 낫다).

처음엔 "1회 관측, 재현 실패"로 기록했다가 조건을 고정해 4/4 로 재현했다.
**재현 못 한 버그를 "간헐적"으로 적어두면 안 고쳐진다.**

### A-2. `lazy()` 가 옛 remote 를 프로세스 수명 내내 고정한다

React 의 `lazy()` 는 한 번 resolve 되면 결과를 영구 보관한다. 번들 캐시를 아무리 비워도
로더가 다시 불리지 않는다. warm 요청이 **네트워크를 전혀 타지 않는** 형태로 드러났다.

```
warm#1 → fetch 0 → 1   (첫 로드)
버전 변경
warm#2 → fetch 1 → 1   ❌ 로더 미호출
```

- **해결**: lazy 캐시 키에 remote 버전을 넣는다 (`${id}@${version}`).
  롤백처럼 "이미 본 적 있는 버전"으로 갈 때는 그것도 부족해서, warm 요청에 nonce 를 실어
  캐시를 우회한다.

### A-3. `revalidateTag` 를 하나만 쓰면 순서를 못 만든다

번들 fetch 와 페이지가 같은 태그를 공유하면, 번들을 깨는 순간 페이지도 깨져서
재생성이 warm 을 앞지른다(→ A-1 로 이어진다).

- **해결**: `mf-remote-bundle:<r>`(Data Cache)과 `mf-remote:<r>`(페이지)로 분리.
- 번들 태그는 `"max"` 가 아니라 `{ expire: 0 }`. `"max"` 는 SWR 이라 다음 fetch 가
  **옛 번들 바이트**를 돌려주고, 그러면 warm 이 옛 코드를 데우면서 성공 보고를 한다.

### A-4. `fetch` 의 `next.tags` 는 `"use cache"` 엔트리를 깨지 않는다

처음엔 "태그가 안 먹는다"고 결론냈는데 **틀렸다.** Cache Components 에서는
`cacheTag()` 를 `"use cache"` 스코프 **안에서** 호출해야 한다. `fetch` 옵션의 태그는
Data Cache 계층에만 붙는다.

고치고 나니 각 캐시 스코프가 "나는 이 remote 에 의존한다"를 스스로 선언하게 되어,
host 가 라우트 맵을 따로 관리할 필요가 없어졌다.

### A-5. 페이지 안 `notFound()` 는 상태 코드를 못 바꾼다

`/internal/mf-warm` 을 페이지 컴포넌트에서 막았더니 미인증 요청에 **200** 이 나갔다.
그 시점엔 루트 레이아웃이 이미 flush 되기 시작해 응답 헤더가 확정된 뒤다.
`instant = false` 로 PPR 셸을 없애도 같았다.

- **해결**: proxy(구 middleware) 에서 막는다(렌더 파이프라인 진입 전). 페이지 안 검사도 남겨둔다.

### A-6. warm 성공 판정을 두 번 틀렸다

1. **HTTP 상태로 판정** → warm 페이지의 remote 는 `RemoteBoundary` 안이라 remote 가 죽어도 200.
2. **로드 횟수 증가로 판정** → 같은 버전 재배포는 캐시 히트라 로드가 안 일어난다.
   정상 배포가 502 로 거부됐다.

- **해결**: "이번 warm 세대에 공표된 버전을 적재했는가"로 본다. remote 생존 확인은
  웹훅이 직접 매니페스트를 읽어 증명한다.

### A-7. 버전 정보를 재구성하면 필드가 사라진다

warm 라우트가 쿼리로 받은 버전으로 매니페스트를 재구성해 전역에 덮어썼는데,
그 재구성본에 무결성 값이 없어서 **두 번째 웹훅부터** 로드가 거부됐다.

- **해결**: 버전을 정하는 곳을 웹훅과 레이아웃 둘로 좁혔다. 로더는 아는 값을 쓰기만 한다.

### A-8. 버전 스크립트가 Suspense 안에 있으면 hydration 이 깨진다

브라우저에 버전을 넘기는 `<script>` 를 `<Suspense>` 로 감쌌더니 셸 **뒤에** 스트리밍됐다.
MF 런타임이 초기화될 때 값이 없어 버전 없는 폴백 엔트리로 붙고, 그 URL 은 이제 존재하지
않으니 404 + CORS 에러가 나면서 remote 가 렌더되지 않았다.

- **해결**: `"use cache"` 로 셸의 일부로 만든다. 캐시된 페이지가 옛 버전을 들고 있는 건
  맞는 동작이다 — 그 HTML 은 그 버전으로 만들어졌고, 웹훅이 같은 태그를 만료시킨다.

### A-9. 옛 버전 자산을 지우면 캐시된 HTML 이 죽는다

`dist` 를 통째로 지웠더니, 캐시에 남아 있던 HTML 이 가리키는 `/v<옛 버전>/…` 이 전부 404.

- **해결**: 버전 디렉터리를 3개까지 보존한다. 캐시 수명만큼은 옛 자산이 살아 있어야 한다.

### A-10. turbo 가 등록 안 된 환경변수를 걸러낸다

`MF_CACHE_COMPONENTS=1 pnpm turbo run build` 가 아무 효과도 없었다. turbo 는 strict env 라
`globalEnv` 에 없는 변수를 태스크 환경에서 제거한다. **에러도 경고도 없다.**

- **해결**: 새 변수는 `turbo.json` 의 `globalEnv` 에 등록한다. lint 규칙
  `turbo/no-undeclared-env-vars` 가 잡아준다.

---

## 0. (2차) remote SSR 도입 후 새로 밟은 것들

### 0-1. `pkill -f 'next start'` 가 안 먹혀서 옛 빌드를 계속 테스트함

`next start` 는 기동 직후 프로세스 이름을 **`next-server`** 로 바꾼다.
그래서 `pkill -f 'next start'` 가 아무것도 죽이지 않고, 새로 띄운 서버는 포트 충돌로
조용히 죽는다. 결과적으로 **몇 번을 재빌드해도 옛 번들이 응답한다.**
새로 추가한 라우트가 404 로 나오면 이걸 먼저 의심할 것.

```bash
for p in 3000 3001 3002 3003; do
  lsof -nP -iTCP:$p -sTCP:LISTEN -t | xargs -r kill -9
done
```

### 0-2. 서버 로더에 node builtin 을 쓰면 브라우저 번들이 깨진다

`server-loader.ts` 는 client component 트리에서 import 되므로 **브라우저 번들에도 들어간다.**
`node:vm` / `node:fs` 를 넣는 순간 Turbopack 이 브라우저 번들에서 터진다.

해결: `fetch` + `new Function` 만 쓴다. 둘 다 양쪽 런타임에 존재하고,
실제 호출은 `typeof window === "undefined"` 분기 안에서만 일어난다.

### 0-3. remote 서버 번들이 자기 React 를 들고 오면 서버에서도 훅이 깨진다

node 타깃 빌드에서 react 계열을 반드시 external 로 빼야 한다.

```ts
// vite.config.server.ts
external: ['react', 'react-dom', 'react/jsx-runtime', 'react/jsx-dev-runtime'];
```

```ts
// rsbuild.server.config.ts
externals: { react: "commonjs react", "react/jsx-runtime": "commonjs react/jsx-runtime", ... }
```

실제로 두 번들이 요구하는 external 은 `react`, `react/jsx-runtime` 뿐이었다.
require 셰임이 목록에 없는 모듈을 만나면 즉시 에러를 던지도록 해두면 설정 실수가 바로 드러난다.

### 0-4. `dev` 에서 SSR 번들이 안 내려옴

remote dev 서버는 웹 번들을 **메모리**에서 서빙한다. SSR 번들은 watch 빌드가
디스크에 쓰므로 dev 서버가 자동으로 서빙하지 않는다.
Vite 는 `configureServer`, Rsbuild 는 `dev.setupMiddlewares` 로 `/mf-server.cjs` 를 직접 내려준다.

또한 dev 에서는 서버 로더 캐시를 끈다. 안 그러면 remote 를 고쳐도 host 가 옛 번들을 계속 쓴다.

```ts
if (process.env.NODE_ENV !== 'production') return loadServerBundle(remote);
```

### 0-4b. `[ dynamic-remote-type-hints-plugin ] err: [object Event]`

```
Console Error
[ dynamic-remote-type-hints-plugin ] err: [object Event]
```

> **정정 이력 (2026-08-14)** — 최초 진단에서 이 에러의 원인을 `dts` 로 지목했으나 **틀렸다.**
> 실제 스위치는 `dev` 옵션이다. 아래는 코드와 실측으로 다시 확인한 내용이다.

**원인**: `dynamic-remote-type-hints-plugin` 은 **런타임 플러그인**이고,
타입 힌트를 받으려고 WebSocket 을 연다.

```js
// @module-federation/dts-plugin/dist/dynamic-remote-type-hints-plugin.js
function createWebsocket() {
  return new WebSocket(`ws://127.0.0.1:${DEFAULT_WEB_SOCKET_PORT}?...`);
}
ws.onerror = (err) => {
  console.error(`[ ${PLUGIN_NAME} ] err`, err);
};
```

주입 주체는 `DtsPlugin` 이 아니라 그 안의 **`DevPlugin`** 이다.

```js
// @module-federation/dts-plugin/dist/index.js — DevPlugin.apply()
const normalizedDev = normalizeOptions(true, {
  disableLiveReload: true,
  disableHotTypesReload: false,
  disableDynamicRemoteTypeHints: false,   // ← 기본값 false = 켜짐
}, 'mfOptions.dev')(dev);

if (!isDev() || normalizedDev === false) return;          // isDev() = NODE_ENV === 'development'
...
if (!normalizedDev.disableDynamicRemoteTypeHints) {
  this._options.runtimePlugins.push('.../dynamic-remote-type-hints-plugin.js');
}
```

정리하면:

| 사실                                            | 근거                                                                                               |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| **dev 빌드에서만** 주입된다                     | `isDev()` = `NODE_ENV === 'development'`                                                           |
| 스위치는 `dev.disableDynamicRemoteTypeHints` 다 | 위 코드                                                                                            |
| `dts: false` 로도 사라지긴 한다                 | `DtsPlugin.apply()` 가 조기 return 하면서 그 안의 `DevPlugin` 도 같이 빠지기 때문. **간접 효과다** |

연결 실패 조건:

- remote 를 preview/프로덕션으로 띄운 경우(WS 서버 자체가 없음) — 단 이때는 애초에 주입도 안 된다
- remote 가 둘 이상이라 기본 포트를 한쪽만 점유한 경우
- host 페이지를 하드 내비게이션으로 떠났다가 돌아와 소켓이 끊긴 경우 ← 사용자가 겪은 상황

**해결 (둘 중 택1)**

```ts
// (A) DTS 를 유지하면서 WS 만 끈다  ← 타입이 필요하면 이쪽
dts: true,
dev: { disableDynamicRemoteTypeHints: true },

// (B) DTS 자체를 끈다  ← 이 저장소의 선택
dts: false,
```

이 저장소는 (B)를 골랐다. 다만 **근거는 콘솔 에러가 아니다.**

1. 타입 계약의 SSOT 가 `@mfa/contracts` 의 `RemoteModuleMap` 이라 정보가 중복이다
2. host 가 타입을 소비하려면 typecheck 전에 remote 가 HTTP 로 떠 있어야 한다 (CI 순서 의존)

자세한 비교: [01-research/03-dts-plugin-review.md](../01-research/03-dts-plugin-review.md)

**실측 (catalog remote, dev 서버가 실제로 내려주는 모듈 그래프를 스캔)**

| 설정                                                    | `dynamic-remote-type-hints` 주입            | DTS 생성                                   |
| ------------------------------------------------------- | ------------------------------------------- | ------------------------------------------ |
| `dts: true` (기본)                                      | **있음** (`remoteEntry.js` + 플러그인 모듈) | 동작                                       |
| `dts: true` + `dev.disableDynamicRemoteTypeHints: true` | **없음**                                    | 동작 (`Federated types created correctly`) |
| `dts: false` (현재)                                     | 없음                                        | 안 함                                      |

> ⚠️ 최초 진단에서 근거로 든 `grep -c 'dynamic-remote-type-hints' apps/*/dist/remoteEntry.js → 0` 은
> **무효한 검증이었다.** `dist/` 는 프로덕션 빌드 산출물이고, 이 플러그인은 `isDev()` 때문에
> 애초에 프로덕션 번들에 들어가지 않는다. `dts` 설정과 무관하게 항상 0 이 나온다.
> dev 서버가 서빙하는 모듈을 봐야 한다.

### 0-4c. 콜드 dev 첫 로드에서 `_jsxDEV is not a function`

증상이 0-5 와 같지만 원인이 다르다.

> **아래는 개정된 내용이다.** 처음에는 원인을 "Vite 가 요청 뒤에 의존성을 발견해
> 사전 번들링(optimizeDeps)한다"로 적고 `optimizeDeps.entries` + `include` 를 해결책으로
> 기록했다. 그 설정은 재현 창을 좁혔을 뿐 닫지 못했고, 같은 에러가 재발했다.
> 진짜 원인은 아래 "원인" 절이다. `optimizeDeps` 설정은 그대로 두되(여전히 필요하다),
> 그것만으로 해결됐다고 보면 안 된다.

**재현 조건**: dev 서버 재시작 + **새 브라우저 세션**의 첫 로드. 관측 3/3 실패.
같은 세션에서 새로고침하면 5/5 정상이라 "첫 로드만 깨지고 새로고침하면 낫는" 모양이 된다.
(`/debug` → `/` 순서는 이번 조사에서 재현되지 않았다 — `optimizeDeps` 설정이 그 창은 막고 있다.)

**원인**: `@module-federation/vite` 가 만드는 expose 로더가 **shared 대기를 `import()` 뒤에 둔다**
(1.20.7 실측). `virtual:mf-exposes:…` 를 받아보면:

```js
"./ProductGrid": async () => {
  await injectCssAssets("./ProductGrid")
  await Promise.all([])                                  // ← 비어 있다
  const importModule = await loadExposedModule(
    "./ProductGrid",
    () => import("/src/exposes/ProductGrid.tsx")          // ← 여기서 loadShare 가 평가된다
  )
  const dependencyPending = importModule && importModule.__mf_remote_dependency_pending;
  if (dependencyPending?.then) await dependencyPending;   // ← 배리어가 import 뒤
  ...
}
```

`ProductGrid.tsx` 는 automatic JSX runtime 이라 `jsxDEV` 를 **정적 import** 한다. 게다가 그 import 는
로컬 사본이 아니라 shared 를 가리킨다(0-4d — 플러그인이 서브엔트리를 자동으로 올린다).

```js
// /src/exposes/ProductGrid.tsx 의 transform 결과
import { jsxDEV as _jsxDEV } from '/@id/__x00__virtual:mf:…loadShare__react/jsx-dev-runtime__loadShare__.js';
```

그 loadShare 모듈의 브라우저 분기는 공유 스코프가 비어 있으면 **`jsxDEV` 를 `undefined` 인 채로
export 하고** 채우기를 뒤로 미룬다. top-level await 이 없다.

```js
let exportModule = __mfReadSharedCache(cache, {canonical:"default:react/jsx-dev-runtime", …});
if (exportModule === undefined) {
  if (import.meta.env.SSR) { /* 즉시 채운다 */ }
  else {
    (__mfModuleCache.pendingShareLoads ||= []).push(initPromise.then(…));  // ← 미루기만 한다
  }
}
export { __mf_1 as jsxDEV };   // __mf_1 === undefined
```

즉 `import()` 되는 순간 값이 `undefined` 로 굳고, 배리어를 나중에 await 해도 그 전에 React 가
렌더하면 터진다. live binding 이라 **나중에는 실제로 채워진다** — 그래서 사후에 확인하면
멀쩡해 보이고, 새로고침하면 낫는다.

콜드 로드 리소스 타임라인(ms):

```
219→220  /mf-manifest.json
225→227  /remoteEntry.js
280→285  /src/exposes/ProductGrid.tsx
286→293  loadShare(react/jsx-dev-runtime)      ← 캐시 miss, undefined 로 굳는다
311→313  .vite/deps/react_jsx-dev-runtime.js   ← 실제 모듈은 20ms 뒤에야 도착
```

host 가 넘기는 모듈 자체는 멀쩡했다(실패한 페이지의 공유 캐시를 직접 확인).

```
default:react/jsx-dev-runtime → ["Fragment", "jsxDEV", "default"]      ← host 쪽은 정상
```

**아닌 것으로 확인된 것**: `.vite/deps` 의 `?v=<browserHash>` 가 스테일이라 504 가 난다는 가설.
그 해시는 dev 재시작마다 바뀌지만(`fdd741cb` → `b9eb7437` 실측) 브라우저는 항상 새 transform 을
받으므로 옛 해시를 참조하지 않는다. 실패한 페이지에서 `.vite/deps` 요청은 **전부 200** 이었다.

**해결**: exposes 를 dev 서버 기동 시점에 미리 transform 해 둔다. 그러면 `import()` 가 즉시
완료되어 위 구간이 사라진다.

```ts
// apps/remote-catalog/vite.config.ts
server: {
  warmup: {
    clientFiles: ["./src/exposes/*.tsx"],
  },
},
```

`optimizeDeps` 는 **의존성**의 사전 번들링이고 `server.warmup` 은 **소스 파일**의 사전 transform 이다.
서로 다른 단계라 둘 다 필요하다. (Vite 8 `server.warmup` — `clientFiles` / `ssrFiles`, root 기준
tinyglobby 패턴. https://vite.dev/config/server-options#server-warmup)

검증(dev 재시작 + 새 브라우저 세션 기준):

| 조건                           | 결과     |
| ------------------------------ | -------- |
| warmup 없음                    | 3/3 실패 |
| exposes 를 `curl` 로 수동 워밍 | 4/4 성공 |
| `server.warmup` 설정           | 5/5 성공 |

**왜 `wait-for-remotes` 가 못 막나**: 그 게이트는 매니페스트와 remoteEntry 가 200 을 주는지까지만
본다. 이 레이스는 HTTP 가 아니라 **브라우저 안 모듈 평가 순서**에서 나므로 게이트를 통과한 뒤에
터진다. 게다가 catalog 의 매니페스트는 dev 모듈 URL 을 싣지 않아(`assets.js.sync` 가
`remoteEntry.js` 뿐 — cart(Rsbuild) 는 실제 청크 경로를 다 싣는다) 게이트가 이 파일들을 알 방법도
없다. 그래서 remote 자기 설정으로 푼다 — host 와 결합이 생기지 않는다.

**교훈**: remote 는 "남의 페이지 안에서 실행되는 앱"이다.
dev 서버가 자기 페이지를 새로고침해 해결하는 종류의 문제는 **remote 에서는 자동 복구되지 않는다.**
그리고 "새로고침하면 낫는다"는 증상은 사후 관측으로 원인을 못 잡는다 —
깨진 시점의 값이 나중에는 정상으로 채워져 있기 때문이다. 리소스 타임라인을 봐야 한다.

### 0-4d. host 가 서브엔트리 공유를 빼면 Vite remote 가 깨진다

0-4c 를 오진해서 `react/jsx-*`, `react-dom/client` 를 host 공유 목록에서 뺐더니 이번엔:

```
[Module Federation] Failed to bridge external shared module "react-dom/client"
TypeError: Cannot read properties of undefined (reading 'd')
[ Federation Runtime ]: Remote container initialization failed. #RUNTIME-015
```

`@module-federation/vite` 는 `react`/`react-dom` 을 공유하면 서브엔트리도 shared 목록에
자동으로 올린다(manifest 확인: `react, react-dom, react/jsx-runtime, react-dom/client`).
host 가 그걸 제공하지 않으면 bridge 단계에서 실패한다.

**결론**: 서브엔트리도 **같이 공유해야 한다.** 다만 넘기는 값의 모양은 정규화한다(0-5).

```
$ node -p "require('./apps/remote-catalog/dist/mf-manifest.json').shared.map(s=>s.name).join()"
react,react-dom,react/jsx-runtime,react-dom/client
```

### 0-5. shared 모듈 네임스페이스 interop

`import * as X from "react/jsx-dev-runtime"` 의 결과 모양은 번들러/모드/대상에 따라
`{ jsxDEV }` 일 수도, CJS interop 때문에 `{ default: { jsxDEV } }` 일 수도 있다.
후자를 그대로 remote 에 넘기면 remote 안에서 `X.jsxDEV` 가 `undefined` 가 된다.

이번 저장소에서는 host 쪽 모양이 실제로는 정상이었지만(진짜 원인은 0-4c),
번들러 조합이 바뀌면 언제든 터질 수 있는 지점이라 방어 코드를 남겼다.

```ts
// apps/host/src/mf/interop.ts
export function normalizeModule<T>(mod: T, probe: string): T {
  const ns = mod as Record<string, unknown> | undefined;
  if (ns && typeof ns[probe] === 'function') return mod;
  const inner = ns?.default as Record<string, unknown> | undefined;
  if (inner && typeof inner[probe] === 'function') return inner as T;
  return mod; // dev 에서는 경고 출력
}
```

브라우저 shared 와 서버 로더의 require 셰임 **양쪽 모두**에 적용한다.

```ts
shared: {
  react:                   { lib: () => normalizeModule(React, "useState"), ... },
  "react-dom":             { lib: () => normalizeModule(ReactDOM, "createPortal"), ... },
  "react-dom/client":      { lib: () => normalizeModule(ReactDOMClient, "createRoot"), ... },
  "react/jsx-runtime":     { lib: () => normalizeModule(ReactJSXRuntime, "jsx"), ... },
  "react/jsx-dev-runtime": { lib: () => normalizeModule(ReactJSXDevRuntime, "jsxDEV"), ... },
}
```

> 참고: `react/jsx-dev-runtime` 은 내부에서 `require("react")` 를 한다.
> 즉 **루트만 싱글턴이면 동작 자체는 성립**한다. 그럼에도 서브엔트리를 공유하는 이유는
> `@module-federation/vite` 가 서브엔트리를 shared 목록에 자동으로 올리고
> host 가 제공하지 않으면 bridge 에 실패하기 때문이다(0-4d).

교훈: **shared 검증은 프로덕션 빌드만으로 부족하다. dev 모드에서도 반드시 돌려봐야 한다.**

### 0-6. `/` 만 스켈레톤이 먼저 나가는 현상

`/` 의 상품 그리드 경계는 React Fizz 가 스트리밍으로 뒤 청크에 실어보낸다
(`<template>` + 숨김 div + `$RC` 치환 스크립트).
`/cart`, `/checkout`, `/products/:id` 는 셸에 인라인으로 들어간다.

**버그가 아니다.** 두 경우 모두 같은 HTTP 응답 안에 remote 마크업이 들어있다.
Fizz 가 경계 크기에 따라 셸 플러시 시점을 다르게 잡을 뿐이다.

---

## 1. `next build` 프리렌더가 MF 런타임을 호출해서 죽음

```
Error occurred prerendering page "/"
Error: Module Federation 런타임은 브라우저에서만 초기화할 수 있습니다
    at src/mf/runtime.ts:33:11
    at src/mf/RemoteComponent.tsx:32:22
```

**원인**: `"use client"` 컴포넌트라도 SSR/프리렌더 단계에서 한 번 렌더된다.
`React.lazy` 팩토리가 그때 실행되면서 브라우저 전용 런타임을 건드린다.

**초판 해결(폐기)**: 하이드레이션 이후에만 remote 를 붙였다(`useIsClient` 게이트).
→ SSR 을 포기하는 방식이라 요구사항 변경 후 폐기.

**현재 해결**: 서버에서도 remote 를 로드할 수 있게 만든다.
`loadRemoteModule` 이 `typeof window === "undefined"` 일 때 remote 의 node 번들을 가져오므로
`React.lazy` 팩토리가 프리렌더 중 실행돼도 정상적으로 컴포넌트를 돌려준다.

프리렌더로 굳으면 remote 재배포가 반영되지 않는데, 그 자리를 **캐시 무효화가 맡는다.**
당시에는 라우트마다 `export const dynamic = "force-dynamic"` 을 달았지만, 5차에서
`cacheComponents: true` 로 이행하면서 그 세그먼트 설정은 제거됐다 — Next 16 은
켜진 상태에서 옛 설정을 컴파일 에러로 거부한다. 지금은 `"use cache"` + `cacheTag(remote)` 로
캐시하고 재배포 웹훅이 태그를 만료시킨다.
→ [04-experiments/03-cache-modes.md](../04-experiments/03-cache-modes.md)

## 2. Turbopack 이 상대경로 `.js` 확장자를 못 찾음

```
./apps/host/src/mf/RemoteComponent.tsx:8:1
Error: Module not found: Can't resolve './runtime.js'
```

**원인**: TS 소스에서 `./runtime.js` 로 쓰면 `moduleResolution: bundler` 의 tsc 는
`./runtime.ts` 로 해석하지만 Turbopack 은 실제 `.js` 파일을 찾는다.

**해결**: Next.js 앱 내부 상대 import 는 확장자를 빼고 쓴다.

```ts
import { loadRemoteModule } from './runtime'; // ✅
```

Vite / Rsbuild remote 쪽은 `.js` 확장자가 있어도 정상 동작한다(둘 다 빌드 성공 확인).

## 3. 공유 UI 패키지 배럴이 Server Component 를 오염시킴

```
at (./packages/ui/dist/use-cart.js:1:10)
```

**원인**: `layout.tsx`(Server Component)가 `@mfa/ui` 에서 `tokens` 만 가져와도,
배럴이 `useSyncExternalStore` 를 쓰는 `use-cart` 까지 끌고 온다.

**해결**: 훅 파일 최상단에 `"use client"` 디렉티브.

```ts
'use client';

import { useSyncExternalStore } from 'react';
```

TypeScript 는 컴파일 출력에도 디렉티브 프롤로그를 보존한다(`dist/use-cart.js` 확인 완료).
디렉티브는 **주석보다 앞**에 와야 한다.

## 4. `eslint-plugin-react` 7.37.5 가 ESLint 10 에서 크래시

```
TypeError: Error while loading rule 'react/display-name':
  contextOrFilename.getFilename is not a function
  at resolveBasedir (eslint-plugin-react/lib/util/version.js:31:100)
  at detectReactVersion (.../version.js:85:19)
```

**원인**: `settings.react.version: "detect"` 경로가 ESLint 10 의 새 context API 와 충돌.

**해결**: 버전을 명시해 탐지 코드를 우회.

```js
settings: { react: { version: "19.2" } },
```

## 5. `react-hooks@7` — 렌더 중 컴포넌트 생성 금지

```
error  Error: Cannot create components during render
  react-hooks/static-components

> 38 |     () => lazy(() => loadRemoteModule(moduleId) as Promise<...>),
```

**원인**: `useMemo(() => lazy(...))` 도 렌더 중 컴포넌트 생성으로 잡힌다.
실제로도 나쁜 패턴 — 컴포넌트 정체성이 흔들리면 remote 상태가 초기화된다.

**해결**: 모듈 스코프 캐시로 옮긴다.

```ts
const lazyCache = new Map<
  RemoteModuleId,
  ComponentType<Record<string, unknown>>
>();

function getLazyRemote(id: RemoteModuleId) {
  const cached = lazyCache.get(id);
  if (cached) return cached;
  const C = lazy(
    () => loadRemoteModule(id) as Promise<{ default: ComponentType }>,
  );
  lazyCache.set(id, C);
  return C;
}
```

JSX 사용 지점에는 캐시 근거를 적은 `eslint-disable-next-line` 을 남겼다.
(린터는 동적 remote 라는 맥락을 알 수 없다)

## 6. Multi-Zone 경계에서 `@next/next/no-html-link-for-pages` 오탐 (앱 삭제됨)

```
error  Do not use an `<a>` element to navigate to `/`.
       Use `<Link />` from `next/link` instead.
```

**원인**: zone 앱에서 host 로 나가는 링크는 **반드시 `<a>` 여야 한다.**
`next/link` 로 감싸면 zone 의 클라이언트 라우터가 자기 라우트로 처리하려다 404.

**해결**: zone 앱 eslint 설정에서만 룰 해제. 이유를 주석으로 남긴다.

```js
// apps/zone-checkout/eslint.config.mjs
rules: { "@next/next/no-html-link-for-pages": "off" }
```

host 에서 zone 으로 나가는 `window.location.href = "/checkout"` 도 같은 이유로
`@next/next/no-location-assign-relative-destination` 을 국소 해제했다.

zone 앱은 6차에서 삭제됐다. 이 항목은 Multi-Zones 를 다시 시도할 때 같은 곳에서
막히지 않도록 남겨둔다.

## 7. `@mfa/contracts` 빌드가 `window` 를 못 찾음

```
src/cart-store.ts(52,14): error TS2304: Cannot find name 'window'.
```

**원인**: 공유 패키지 tsconfig 의 `lib` 이 `["ES2023"]` 뿐이라 DOM 타입이 없다.

**해결**: contracts tsconfig 에 DOM 추가.

```json
"lib": ["DOM", "DOM.Iterable", "ES2023"]
```

`typeof window === "undefined"` 가드는 유지 — 서버에서도 import 되는 모듈이다.

## 8. pnpm 설치 중 rspack 바이너리 타임아웃

```
[WARN] GET https://registry.npmjs.org/@rspack/binding-darwin-arm64/... error (23)
TimeoutError: The operation was aborted due to timeout
```

**해결**: `pnpm install --fetch-timeout 300000`

## 진단 체크리스트

**SSR 이 안 될 때** (초기 HTML 에 remote 마크업이 없음):

1. `curl localhost:3001/mf-server.cjs | head -c 100` → 200 인지
2. remote 의 `ssr` watch 프로세스가 살아있는지 (`pnpm dev` 로그의 `[ssr]` 라인)
3. host 서버 로그에 `예상 밖 모듈을 require` 에러가 있는지 → external 설정 문제
4. 캐시 HIT 가 아닌지 — `"use cache"` 라우트는 옛 HTML 을 그대로 준다.
   `/api/mf-revalidate` 로 태그를 깨거나 `/lab/ssr`(캐시 없는 경로)로 대조한다
   (`export const dynamic = "force-dynamic"` 은 Next 16 `cacheComponents` 에서 쓰지 않는다)

**remote 자체가 안 뜰 때** 순서대로:

1. `/debug` 열어서 manifest 프로브 상태 확인
2. `fail` → remote dev 서버 기동 여부 → CORS 헤더(`access-control-allow-origin: *`) → 포트 충돌
3. `ok` 인데 렌더 안 됨 → 브라우저 콘솔에서 `window.__FEDERATION__.__SHARE__` 로 공유 스코프 확인
4. `Invalid hook call` → React 가 2벌 로드됨. host 의 `init({ shared })` 에
   `react` / `react-dom` / `react/jsx-runtime` 이 다 들어있는지 확인
5. 모듈 이름 불일치 → `/debug` 의 `exposes` 목록과
   `packages/contracts/src/remote-contract.ts` 의 `RemoteModuleMap` 키 대조
6. `_jsxDEV is not a function` (dev, catalog) → **콘솔로 사후 확인하지 말 것.** 그때는 이미
   정상으로 채워져 있다. DevTools Network 를 시각순으로 보고
   `/src/exposes/*.tsx` 와 `.vite/deps/react_jsx-dev-runtime.js` 의 순서를 확인한다.
   후자가 뒤면 그 창이다 → `vite.config.ts` 의 `server.warmup` 이 살아있는지 확인 (0-4c)
