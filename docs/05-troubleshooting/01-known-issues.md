# 구축 중 실제로 터진 문제들

전부 이 저장소를 세우면서 재현된 것들이다. 로그는 실제 출력.

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

- **해결**: middleware 에서 막는다(렌더 파이프라인 진입 전). 페이지 안 검사도 남겨둔다.

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
external: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime"]
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
if (process.env.NODE_ENV !== "production") return loadServerBundle(remote);
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
ws.onerror = (err) => { console.error(`[ ${PLUGIN_NAME} ] err`, err); };
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

| 사실 | 근거 |
| --- | --- |
| **dev 빌드에서만** 주입된다 | `isDev()` = `NODE_ENV === 'development'` |
| 스위치는 `dev.disableDynamicRemoteTypeHints` 다 | 위 코드 |
| `dts: false` 로도 사라지긴 한다 | `DtsPlugin.apply()` 가 조기 return 하면서 그 안의 `DevPlugin` 도 같이 빠지기 때문. **간접 효과다** |

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

| 설정 | `dynamic-remote-type-hints` 주입 | DTS 생성 |
| --- | --- | --- |
| `dts: true` (기본) | **있음** (`remoteEntry.js` + 플러그인 모듈) | 동작 |
| `dts: true` + `dev.disableDynamicRemoteTypeHints: true` | **없음** | 동작 (`Federated types created correctly`) |
| `dts: false` (현재) | 없음 | 안 함 |

> ⚠️ 최초 진단에서 근거로 든 `grep -c 'dynamic-remote-type-hints' apps/*/dist/remoteEntry.js → 0` 은
> **무효한 검증이었다.** `dist/` 는 프로덕션 빌드 산출물이고, 이 플러그인은 `isDev()` 때문에
> 애초에 프로덕션 번들에 들어가지 않는다. `dts` 설정과 무관하게 항상 0 이 나온다.
> dev 서버가 서빙하는 모듈을 봐야 한다.

### 0-4c. remote 를 **처음** 로드한 페이지에서만 `_jsxDEV is not a function`

증상이 0-5 와 같지만 원인이 다르다. 이쪽이 진짜 원인이었다.

**재현 조건**: catalog(Vite) remote 를 아직 한 번도 안 부른 상태에서
`/debug`(cart remote 만 사용) → `/`(catalog 사용) 순서로 이동.
`/` 를 **첫 페이지로** 열면 재현되지 않는다. 다음 내비게이션부터는 정상.

**원인**: Vite dev 서버는 요청이 들어온 **뒤에** 의존성을 발견해 사전 번들링(optimizeDeps)한다.
일반 Vite 앱이라면 최적화 후 HMR 클라이언트가 페이지를 새로고침해 정상화된다.
그런데 remote 는 **host 페이지 안에서** 로드되므로 그 새로고침이 오지 않는다.
그 페이지에는 interop 이 깨진 모듈이 그대로 남는다.

host 가 넘기는 모듈 자체는 멀쩡했다(브라우저에서 직접 확인).

```
jsxDev: ["Fragment", "jsxDEV", "default"]      ← host 쪽은 정상
```

**해결**: dev 서버 기동 시점에 사전 번들링을 끝내도록 진입점과 대상을 명시한다.

```ts
// apps/remote-catalog/vite.config.ts
optimizeDeps: {
  entries: ["src/exposes/*.tsx", "src/main.tsx"],
  include: ["react", "react-dom", "react-dom/client",
            "react/jsx-runtime", "react/jsx-dev-runtime"],
},
```

**교훈**: remote 는 "남의 페이지 안에서 실행되는 앱"이다.
dev 서버가 자기 페이지를 새로고침해 해결하는 종류의 문제는 **remote 에서는 자동 복구되지 않는다.**

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
  if (ns && typeof ns[probe] === "function") return mod;
  const inner = ns?.default as Record<string, unknown> | undefined;
  if (inner && typeof inner[probe] === "function") return inner as T;
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

대신 프리렌더로 굳으면 안 되므로 해당 라우트는 전부 dynamic 이다.

```ts
export const dynamic = "force-dynamic";
```

## 2. Turbopack 이 상대경로 `.js` 확장자를 못 찾음

```
./apps/host/src/mf/RemoteComponent.tsx:8:1
Error: Module not found: Can't resolve './runtime.js'
```

**원인**: TS 소스에서 `./runtime.js` 로 쓰면 `moduleResolution: bundler` 의 tsc 는
`./runtime.ts` 로 해석하지만 Turbopack 은 실제 `.js` 파일을 찾는다.

**해결**: Next.js 앱 내부 상대 import 는 확장자를 빼고 쓴다.

```ts
import { loadRemoteModule } from "./runtime";   // ✅
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
"use client";

import { useSyncExternalStore } from "react";
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
const lazyCache = new Map<RemoteModuleId, ComponentType<Record<string, unknown>>>();

function getLazyRemote(id: RemoteModuleId) {
  const cached = lazyCache.get(id);
  if (cached) return cached;
  const C = lazy(() => loadRemoteModule(id) as Promise<{ default: ComponentType }>);
  lazyCache.set(id, C);
  return C;
}
```

JSX 사용 지점에는 캐시 근거를 적은 `eslint-disable-next-line` 을 남겼다.
(린터는 동적 remote 라는 맥락을 알 수 없다)

## 6. Multi-Zone 경계에서 `@next/next/no-html-link-for-pages` 오탐

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
4. 해당 라우트에 `export const dynamic = "force-dynamic"` 이 있는지

**remote 자체가 안 뜰 때** 순서대로:

1. `/debug` 열어서 manifest 프로브 상태 확인
2. `fail` → remote dev 서버 기동 여부 → CORS 헤더(`access-control-allow-origin: *`) → 포트 충돌
3. `ok` 인데 렌더 안 됨 → 브라우저 콘솔에서 `window.__FEDERATION__.__SHARE__` 로 공유 스코프 확인
4. `Invalid hook call` → React 가 2벌 로드됨. host 의 `init({ shared })` 에
   `react` / `react-dom` / `react/jsx-runtime` 이 다 들어있는지 확인
5. 모듈 이름 불일치 → `/debug` 의 `exposes` 목록과
   `packages/contracts/src/remote-contract.ts` 의 `RemoteModuleMap` 키 대조
