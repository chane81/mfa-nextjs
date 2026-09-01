# host 의 `src/mf` 배치 — 목적축으로 나눈 여섯 폴더

host 가 remote 를 소비하는 코드는 전부 `apps/host/src/mf/` 안에 있다. 26차 전에는 그
디렉터리가 **평면이었다** — 소스 15개와 테스트 12개가 한 층에 나란히 있었고, 파일을
열기 전에는 그게 "주소를 만드는 코드"인지 "버전을 읽는 코드"인지 "React 표면"인지
이름으로 구분되지 않았다.

지금은 **여섯 폴더**다. 나눈 축은 레이어(client/server)가 아니라 **그 폴더가 답하는
질문**이다.

| 폴더          | 답하는 질문                       | 파일                                                       |
| ------------- | --------------------------------- | ---------------------------------------------------------- |
| `config/`     | remote 주소는? 호출 예산은?       | `index.ts`                                                 |
| `versions/`   | 지금 가리켜야 할 버전이 무엇인가? | `index.ts` · `browser.ts` · `server.ts`                    |
| `state/`      | 이 프로세스가 지금 뭘 들고 있나?  | `cell.ts` · `warm.ts` · `loader-stats.ts`                  |
| `trust/`      | 이 remote 를 믿어도 되나?         | `index.ts`                                                 |
| `loader/`     | 어떻게 가져와서 실행하나?         | `index.ts` · `server.ts` · `react-modules.ts`              |
| `components/` | 화면에 어떻게 붙나?               | `RemoteComponent` · `RemoteBoundary` · `RemoteVersionSync` |

테스트는 저장소 규칙대로 **대상 소스 옆**에 그대로 둔다(`trust/index.ts` →
`trust/index.test.ts`). 폴더를 나누면 테스트도 같이 나뉜다 — 그게 이 배치의 실질적인
이득이다. `trust/` 를 고칠 때 열어야 할 테스트가 `trust/` 안에만 있다.

## 왜 레이어가 아니라 목적인가

`server/` · `client/` 로 나누는 배치를 먼저 검토했고 **기각했다.** 이 코드베이스에서
레이어는 파일의 성질이 아니라 **값의 성질**이기 때문이다.

- `versions/` 는 폴더 하나 안에 server(`announcedVersion`)와 browser(`injectedEntry`)가
  같이 있고, 그 둘을 합치는 `index.ts` 가 있어야 의미가 성립한다. 레이어로 쪼개면
  이 셋이 세 폴더로 흩어지고 "둘 중 있는 쪽을 집는다"는 규칙이 어디에도 안 남는다.
- `loader/index.ts` 는 **isomorphic** 이다. `typeof window` 로 갈라져 한쪽은
  `loader/server.ts` 로, 다른 쪽은 MF 런타임으로 간다. 어느 레이어 폴더에도 못 넣는다.
- `trust/` 는 서버가 쓰지만 **client component 트리에서 import 되어** 브라우저 번들에도
  실린다(그래서 `node:crypto` 가 아니라 WebCrypto 를 쓴다). "서버 코드"라고 부르면
  그 제약이 사라진다.

레이어 정보는 폴더 이름 대신 **파일 이름과 머리말**이 진다 — `versions/server.ts` 는
"서버 전용"을 첫 줄에 적고, `config/index.ts` 는 web/ssr 두 축을 표로 적는다.

## 의존 방향은 한 방향이다

```
components/  →  loader/  →  versions/  →  trust/  →  config/
                   ↓            ↓          ↓
                 state/       state/     config/
```

- `config/` 는 `@mfa/remote-config` 말고는 아무것도 import 하지 않는 **잎**이다.
- `state/cell.ts` 는 import 가 아예 없다. 그래서 어느 폴더에서든 순환 없이 부를 수 있다.
- 역방향 화살표가 없다. `trust/` 가 `versions/` 를 부르거나 `config/` 가 `loader/` 를
  부르는 코드가 생기면 그건 그 값이 잘못된 폴더에 있다는 신호다.

## 26차에 같이 정리한 중복

폴더를 나누면서 **같은 것이 두 곳에 적혀 있던 자리**를 걷어냈다.

| 걷어낸 것                                     | 왜 위험했나                                                                                                                                                              |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| React 공유 모듈의 **정규화 프로브**가 두 벌   | 브라우저용(`runtime.ts`)과 서버용(`server-loader.ts`)에 각각 적혀 있었다. 한쪽만 어긋나면 그 모듈만 조용히 싱글턴에서 빠지고, 증상은 훅이 깨지는 것이라 원인이 안 보인다 |
| `WEB_ENTRIES` 의 별칭 `REMOTE_ENTRIES`        | 같은 값에 이름이 둘. 진단 화면과 렌더 경로가 서로 다른 이름으로 같은 것을 읽고 있었다                                                                                    |
| `fallbackSsrEntry(remote)`                    | `SSR_ENTRIES[remote]` 를 그대로 돌려주는 한 줄 래퍼                                                                                                                      |
| `constants.ts`                                | 상수 하나짜리 파일. `config/` 가 "remote 접근 설정"을 다 들고 있으므로 그 안이 자리다                                                                                    |
| `trustedOrigins()` 가 `versions/server.ts` 에 | 신뢰 판단인데 버전 파일에 있었다. `trust/` 로 옮겨 신뢰 API 창구를 하나로 만들었다                                                                                       |

이름도 두 군데 손봤다. `REMOTE_ORIGINS` → `WEB_ORIGINS`, `remoteOrigin()` → `ssrOrigin()`.
둘은 **값이 같고 출처가 다른** 위험한 쌍인데(하나는 브라우저에서도 맞고 하나는 서버
전용이다) 이름이 그 차이를 안 드러냈다. 이제 `WEB_ENTRIES`/`WEB_ORIGINS` 와
`SSR_ENTRIES`/`ssrOrigin()` 이 각각 짝을 이룬다.

## ⚠️ `react-dom/client` 는 공유 표에 실체를 담을 수 없다

프로브 표를 하나로 합칠 때 **네임스페이스까지 같이 담으려다 빌드가 깨졌다.**

`loader/server.ts` 는 Route Handler(`/api/mf-revalidate`)에서도 닿으므로 **RSC 그래프**에
들어간다. 공유 모듈 파일이 `react-dom/client` 를 import 하면 그게 RSC 그래프까지 딸려
들어가고 Next 가 막는다.

```
You're importing a component that imports react-dom/client. It only works in a
Client Component but none of its parents are marked with "use client" …
```

그래서 `loader/react-modules.ts` 는 **이름과 프로브만** 들고 있고, `import * as React`
같은 네임스페이스는 브라우저 경로와 서버 경로가 각자 자기 그래프에서 가져온다. 목록이
맞는지는 각 호출부의 `satisfies`(브라우저는 `Record<SharedModuleId, unknown>`, 서버는
`Record<SsrExternal, unknown>`)가 컴파일 타임에 확인한다.

## 옛 경로 → 새 경로

과거 회차 기록과 오래된 링크를 읽을 때 쓴다.

| 26차 이전                  | 지금                                  |
| -------------------------- | ------------------------------------- |
| `mf/runtime.ts`            | `mf/loader/index.ts`                  |
| `mf/server-loader.ts`      | `mf/loader/server.ts`                 |
| `mf/interop.ts`            | `mf/loader/react-modules.ts`          |
| `mf/remote-endpoints.ts`   | `mf/config/index.ts`                  |
| `mf/constants.ts`          | `mf/config/index.ts` (흡수)           |
| `mf/global-state.ts`       | `mf/state/cell.ts`                    |
| `mf/warm-state.ts`         | `mf/state/warm.ts`                    |
| `mf/loader-stats.ts`       | `mf/state/loader-stats.ts`            |
| `mf/remote-trust.ts`       | `mf/trust/index.ts`                   |
| `mf/RemoteComponent.tsx`   | `mf/components/RemoteComponent.tsx`   |
| `mf/RemoteBoundary.tsx`    | `mf/components/RemoteBoundary.tsx`    |
| `mf/RemoteVersionSync.tsx` | `mf/components/RemoteVersionSync.tsx` |
| `mf/versions/*`            | 그대로                                |

## 새 파일을 어디에 두나

1. **remote 주소나 호출 한도를 만든다** → `config/`. 경로 문자열을 직접 조립하지
   않는다는 규칙(`@mfa/remote-config` 가 SSOT)은 그대로다.
2. **remote 가 준 값을 믿을지 판단한다** → `trust/`. 오리진·경로 형태·무결성·서명 넷은
   순서가 있는 한 덩어리다.
3. **프로세스가 들고 있는 것을 기록한다** → `state/`. RSC 레이어와 SSR 레이어가 모듈
   그래프를 달리하므로 모듈 스코프 변수는 답이 아니다 — `globalCell` 을 쓴다.
4. **remote 바이트를 가져오거나 실행한다** → `loader/`.
5. **React 트리에 붙는다** → `components/`.

어느 것도 아니면 폴더가 하나 부족한 것이다. 그때는 이 문서에 줄을 하나 더 넣는다.
