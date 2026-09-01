---
paths:
  - 'apps/host/src/mf/**'
  - 'packages/remote-config/**'
  - 'packages/contracts/**'
  - 'packages/store/**'
---

# host 의 MF 소비 계약

host 는 번들러 플러그인 없이 `@module-federation/runtime` 만 쓴다. 브라우저는 웹 매니페스트로,
서버는 CJS 번들(`mf-server.cjs`)을 받아 **평가해서** remote 를 렌더한다.

## SSOT 를 지킨다

| 무엇                     | 어디                                                                 |
| ------------------------ | -------------------------------------------------------------------- |
| remote 이름 · 포트 · env | `packages/remote-config`                                             |
| 산출물 파일명 · URL 조립 | 같은 패키지의 `MF_FILES` · `*Url()` · `versionedPath()`              |
| React external 목록      | 같은 패키지의 `SSR_EXTERNALS` (remote 빌드 · host 셰임이 같이 본다)  |
| 매니페스트 서명 페이로드 | 같은 패키지의 `signedPayload()` (stamp 와 host 검증이 같이 본다)     |
| 빌드 버전 · dist 경로    | `@mfa/remote-config/node` — `readBuildVersion()` · `versionedDist()` |
| remote 모듈 타입         | `packages/contracts` 의 `RemoteModuleMap`                            |
| 런타임 공유 상태         | `packages/store` — 도메인별 폴더(`cart/`)                            |
| 레이어를 넘는 host 상태  | `apps/host/src/mf/global-state.ts` 의 `globalCell()`                 |

`@mfa/remote-config` 는 **진입점이 둘**이다. `index.ts` 는 host 의 브라우저 번들에 실리므로
node builtin 을 넣을 수 없고, node 전용 코드는 전부 `node.ts`(`@mfa/remote-config/node`) 로 간다.
그 경계는 `tsconfig.json`(`types: []`)과 `tsconfig.node.json`(`types: ["node"]`)이 강제한다.

상대 import 경로에는 **확장자를 붙이지 않는다**(저장소 전역 규칙). 모든 소비가 번들러를
거치기 때문이다 — host 는 `transpilePackages` 로 `@mfa/ui`·`@mfa/contracts` 를 직접 번들하고,
remote 는 Vite·Rsbuild 가 번들한다. 근거: known-issues D-1.

`packages/remote-config` **안에서는 상대 import 를 쓰지 않는다.** 이건 Node 가 번들러 없이
직접 읽는 유일한 패키지라, 확장자를 빼면 Node 가 못 찾고(`ERR_MODULE_NOT_FOUND`) 붙이면
tsc 가 막는다(`TS5097`). 이 패키지는 빌드 산출물이 없어서 소비처의 tsc 가 소스를 직접
검사하므로 `allowImportingTsExtensions` 를 켤 수도 없다 — 소비처 중에 dist 를 emit 하는
프로젝트가 있다. **자기 참조로 부른다**: `import { … } from '@mfa/remote-config'`.
15차에 양쪽을 다 밟고 나온 결론이다.

경로 문자열(`/mf-server.cjs`, `/style.css`, `/v<version>/…`)을 호출부에서 **직접 조립하지 않는다.**
번들러별 디렉터리 규칙이 계약에 새면 catalog(Vite)와 cart(Rsbuild)가 갈라진다.

`packages/remote-config` 는 빌드 산출물이 없다 — `exports` 가 소스 `.ts` 를 직접 가리키고
Node 의 타입 스트리핑에 기댄다. 그래서 이 패키지에는 런타임 의존성을 넣지 않는다.

## 서버 전용 값과 브라우저 안전 값을 섞지 않는다

`publicOrigin()` 은 `process.env[이름]` 을 **동적으로** 읽으므로 Next 가 치환하지 못한다.
브라우저 번들에서 쓰면 배포에서 조용히 `localhost` 로 떨어진다.

| 쓰는 곳              | 써야 할 것                                                         |
| -------------------- | ------------------------------------------------------------------ |
| 서버(SSR 로더 등)    | `SSR_ENTRIES` · `publicOrigin()`                                   |
| 브라우저에 나가는 값 | `REMOTE_ORIGINS` · `WEB_ENTRIES` (`next.config.ts` 가 구워 넣는다) |

같은 성질이 **`globalThis` 에 사는 값**에도 있다. 그래서 버전 코드는
`apps/host/src/mf/versions/` 에서 **값이 어디서 유효한지로** 갈라 둔다.

| 파일                  | 값이 사는 곳                                 | 누가 import 하나                 |
| --------------------- | -------------------------------------------- | -------------------------------- |
| `versions/server.ts`  | remote 가 **공표한** 값 (`announcedVersion`) | RSC 레이아웃 · SSR 로더 · 라우트 |
| `versions/browser.ts` | 서버가 **심어준** 값 (`injectedEntry`)       | `runtime.ts`(엔트리 URL) · 진단  |
| `versions/index.ts`   | — 둘 중 있는 쪽 (`remoteVersion`)            | **렌더 코드 전부**               |

적재 상태와 warm 세대는 버전이 아니라 "그 버전으로 뭘 했나" 라서 `mf/warm-state.ts` 에 있다.

이름은 위치가 아니라 **출처**로 짓는다(공표된 / 심어준). 그래야 합치는 줄에서 두 항이
같은 모양이 되고, 같은 종류의 값이라는 게 보인다.

**버전이 필요하면 `remoteVersion()`(`mf/versions`) 하나만 부른다.** 둘 중 어느 쪽을 읽을지는
그 함수 안에서 끝나고, `typeof window` 로 가르지 않는다(근거: known-issues G-1).
새 코드가 `versions/server` 를 브라우저 렌더 경로에서 import 하고 있으면 그건 신호다.

## 환경변수를 추가하면 `turbo.json` 에 등록한다

`globalEnv` 에 없는 변수는 turbo 가 **걸러낸다**. 실패가 "값이 비어 있다"로 나타나 원인이 안 보인다.
이 함정은 두 번 밟았다(known-issues A-10, B-8).

## remote 호출은 반드시 실패 가능하다고 본다

버전 조회 · SSR 번들 fetch 에는 제한 시간(`AbortSignal.timeout`)이 걸려 있고, 실패 원인
(제한 시간 / 응답 이상 / 검증 실패)을 구분해 로그에 남긴다. 새 remote 호출을 추가할 때 이 셋을
빠뜨리지 않는다. 렌더 경계는 `RemoteBoundary` 가 맡는다 — remote 하나가 죽어도 페이지는 산다.

버전 문자열은 경로(`/v<version>/`)에 들어가므로 쓰기 전에 형태를 검증한다(`assertSafeVersion`).
