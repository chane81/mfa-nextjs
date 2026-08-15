# 구축 중 실제로 터진 문제들

전부 이 저장소를 세우면서 재현된 것들이다. 로그는 실제 출력.

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

| 조각 | turbo 가 되나 |
| --- | --- |
| remote 를 먼저 빌드 | O — `@mfa/host#build.dependsOn` |
| 준비될 때까지 대기 | O — 유한 프로브 태스크 |
| **끝나면 내리기** | **X** |

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

| 래퍼가 하던 일 | 왜 뺐나 |
| --- | --- |
| 준비될 때까지 폴링 | 경쟁이 아니었다 — 바인딩 `+1ms` vs 첫 요청 `+6451ms`(실측) |
| 이미 뜬 오리진이면 no-op | 이미지가 `docker:build` 로 갈라져서 이 스크립트를 안 탄다 |
| `.env.local` 파싱 | 그 파일이 코드 기본값을 그대로 다시 적은 것이라 삭제했다 |
| dev 점유 감지 | 무결성 에러로 죽는다. 힌트를 그 에러 메시지에 넣었다 |

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

| 태스크 | remote 게이트 | 쓰는 곳 |
| --- | --- | --- |
| `@mfa/host#build` | 있음 | 로컬 (`pnpm build`, `pnpm start`) |
| `@mfa/host#docker:build` | 없음 (`^build` 만) | `apps/host/Dockerfile` |

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

### B-5. 빈 문자열 env 가 `new URL("")` 로 터질 자리가 남아 있었다

`REMOTE_*_SSR_ENTRY` 를 Dockerfile `ARG` 로 받게 하면서 드러났다.

```ts
process.env.REMOTE_CATALOG_SSR_ENTRY ?? "http://localhost:3001/mf-server.cjs"
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
4. 해당 라우트에 `export const dynamic = "force-dynamic"` 이 있는지

**remote 자체가 안 뜰 때** 순서대로:

1. `/debug` 열어서 manifest 프로브 상태 확인
2. `fail` → remote dev 서버 기동 여부 → CORS 헤더(`access-control-allow-origin: *`) → 포트 충돌
3. `ok` 인데 렌더 안 됨 → 브라우저 콘솔에서 `window.__FEDERATION__.__SHARE__` 로 공유 스코프 확인
4. `Invalid hook call` → React 가 2벌 로드됨. host 의 `init({ shared })` 에
   `react` / `react-dom` / `react/jsx-runtime` 이 다 들어있는지 확인
5. 모듈 이름 불일치 → `/debug` 의 `exposes` 목록과
   `packages/contracts/src/remote-contract.ts` 의 `RemoteModuleMap` 키 대조
