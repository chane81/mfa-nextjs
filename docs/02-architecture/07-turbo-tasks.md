# turbo 태스크 설계

`turbo.json` 의 각 설정이 **왜 그 모양인지**를 적는다. `turbo.json` 자체에는 주석을 두지 않는다
(49차, 아래 [왜 주석이 여기 있나](#왜-주석이-여기-있나)). 절 제목은 `turbo.json` 의 키 이름과
같다 — 설정을 고칠 때 그 키로 이 문서를 찾는다.

**`turbo.json` 을 고쳤으면 이 문서의 해당 절도 같이 고친다.** 설정과 근거가 떨어져 있으니
어긋나기 쉽다. 새 키를 추가했으면 절을 하나 추가한다.

## `globalEnv`

여기 등록하지 않은 변수는 turbo 가 태스크 환경에서 **걸러낸다**(strict env). 실패가
"값이 비어 있다"로 나타나 원인이 안 보인다 — 두 번 밟았다(known-issues A-10, B-8).
반대로 여기 든 값이 바뀌면 **모든 태스크가 캐시를 놓친다**(turbo 문서: "any change to these
variables will cause all tasks to miss the cache"). 그래서 꼭 필요한 것만 넣는다.

| 항목                       | 이유                                                                                                                                                                                                                                      |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NODE_ENV`                 | 빌드 결과가 달라진다                                                                                                                                                                                                                      |
| `REMOTE_*`                 | remote 오리진(`…_PUBLIC_URL` — remote 당 이거 하나다)과 신뢰 경계(`REMOTE_ALLOWED_ORIGINS`). 아래 참고                                                                                                                                    |
| `MFA_REMOTE_WEB_ENTRIES`   | `REMOTE_*_PUBLIC_URL` 을 순회해 만든 매니페스트 URL 들을 `next.config.ts` 가 이 이름으로 번들에 굽는다. 보통은 환경에서 오지 않지만 밖에서 직접 넣어 덮어쓰는 것도 유효한 사용이라 캐시 키로 추적한다. remote 개수와 무관한 단일 이름이다 |
| `MF_*`                     | MF 운영 변수. 아래 표                                                                                                                                                                                                                     |
| `PORT`                     | Next 서버가 실제로 바인딩한 포트. warm 자기호출 주소를 만들 때 읽는다                                                                                                                                                                     |
| `WAIT_FOR_REMOTES_TIMEOUT` | host dev 가 remote 를 기다리는 시간(`scripts/wait-for-remotes.ts`). 등록 전에는 `WAIT_FOR_REMOTES_TIMEOUT=1` 을 줘도 60초를 다 기다렸다 — 실측(B-8)                                                                                       |

### `REMOTE_*` 를 와일드카드 한 줄로 받는 이유

이름 하나하나를 적으면 remote 를 추가할 때마다 `packages/remote-config` 와 `turbo.json` 을 같이
고쳐야 하는데, 그러면 SSOT 가 반쪽이 된다. turbo 는 접두사 와일드카드를 지원하므로 이름 목록을
여기 복제하지 않아도 된다.

브라우저용 매니페스트 URL 과 host 서버용 SSR 번들 URL 은 전부 `…_PUBLIC_URL` 에서 파생된다.
파일명은 `MF_FILES` 에 있고 코드가 붙인다 — env 로 오지 않는다.

### `MF_*` 에 드는 것

remote 개수와 무관한 단일 값들이다.

| 변수                   | 용도                                              |
| ---------------------- | ------------------------------------------------- |
| `MF_REVALIDATE_SECRET` | 재배포 → host 캐시 무효화 웹훅 시크릿             |
| `MF_SELF_ORIGIN`       | warm 자기호출 주소 (기본 루프백, 보통 미설정)     |
| `MF_REMOTE_PUBLIC_KEY` | 매니페스트 서명 검증용 공개키 (host)              |
| `MF_SIGNING_KEY`       | 매니페스트 서명용 개인키 (remote 파이프라인 전용) |
| `MF_REQUIRE_*`         | 서명 · 무결성 강제 여부                           |

신뢰 경계 배경: [03-cache-modes.md](../04-experiments/03-cache-modes.md) 발견 9.

### 넣지 않은 것: `TZ` · `CI`

**turbo 를 안 타는 실행에서만 읽는 값은 넣지 않는다.** `pnpm test` 는 turbo 를 거치지 않는다
([`test` 가 turbo 에 없는 이유](#test-가-turbo-에-없는-이유)). 그런 값을 넣으면 얻는 것 없이
전역 캐시만 깨진다.

- `TZ` — 읽는 건 vitest 테스트 하나뿐이다. `turbo/no-undeclared-env-vars` 경고 때문에 넣었었는데,
  그 테스트가 `process.env.TZ` 대신 `vi.stubEnv('TZ', …)` 를 쓰게 되면서 경고 자체가 사라졌다.
- `CI` — `vitest.config.ts` 의 `slowTestThreshold` 가 읽는다. GitHub Actions 러너가 항상
  `true` 로 넣는다. 경고는 `oxlint.config.ts` 에서 turbo 밖 파일의 규칙 범위를 고쳐 정리했다.

## `tasks`

### `build`

기본 빌드. `^build` 로 의존 패키지를 먼저 빌드한다.

### `@mfa/host#build`

host 빌드는 순수한 컴파일이 아니다. 프리렌더 중에 remote 의 SSR 번들을 HTTP 로 받아
실행하므로(`apps/host/src/mf/loader/server.ts`) **빌드 시점에 remote 오리진이 살아 있어야 한다.**
배포에서는 remote 가 이미 떠 있어서 안 보이던 요구사항이다(known-issues B-1).

그래서 두 가지가 필요하다.

| 필요한 것                  | 누가 하나                                         |
| -------------------------- | ------------------------------------------------- |
| ① remote 를 먼저 빌드한다  | `dependsOn` 에 remote 빌드를 이름으로 건다        |
| ② 빌드된 dist 를 띄워 둔다 | turbo 가 못 한다 → `scripts/serve-all-remotes.ts` |

②를 turbo 로 쓰면 `with`(사이드카) + 유한 readiness 프로브 조합인데, 사이드카가
`persistent: true` 라 host 빌드가 끝나도 죽지 않아 **`turbo run build` 가 종료하지 않는다**
(실측, B-2). 그 패턴은 Ctrl-C 로 끝내는 `dev` 용이지 반드시 exit 해야 하는 `build` 용이 아니다.

그래서 ②는 host 의 `build` 스크립트가 `scripts/serve-all-remotes.ts` 로 처리한다 —
`REMOTE_LIST` 를 순회해 정적 서버를 in-process 로 전부 띄우고 `next build` 를 자식으로 돌린 뒤,
빌드가 끝나면(또는 시그널을 받으면) 같이 내린다. 띄울 목록이 SSOT 에서 나오므로 remote 를
추가해도 그 스크립트는 안 바뀐다. `dependsOn` 의 remote 이름은 JSON 이라 파생할 수 없어서
`scripts/remote-wiring.test.ts` 가 SSOT 와 대조한다.

준비 대기는 따로 안 한다. 서버 바인딩은 +1ms, `next build` 의 첫 remote 요청은 +6451ms 다(실측).
컴파일 · 타입체크가 그 앞을 막고 있어서 경쟁이 성립하지 않는다.

- ⚠️ **패키지 스코프 설정은 기본 `build` 를 상속하지 않고 대체한다.** `outputs` 를 다시 적는 이유다.
- `inputs` 의 `.env*` 는 보험이다. turbo 의 기본 입력 집합은 git 이 추적하는 파일이라
  gitignore 된 `.env.local` 이 빠지는데, 그 파일에 `REMOTE_*_PUBLIC_URL` 을 적으면 **프리렌더
  결과가 거기 달린다.** 없으면 오리진을 바꿔도 캐시된 옛 `.next` 가 그대로 복원된다
  (실측: FULL TURBO, B-7). 지금 저장소에 `.env.local` 은 없지만 누가 만들면 그 순간 이 줄이 일한다.
  `$TURBO_DEFAULT$` 는 기본 집합을 유지하면서 덧붙이라는 뜻이다.

### `@mfa/host#docker:build`

이미지용 host 빌드. `build` 와 산출물은 같고 **remote 게이트만 없다.**

이미지 안에서 remote 는 이미 배포된 공개 도메인이다. 워크스페이스 remote 를 빌드할 이유가
없을 뿐 아니라, 빌드해버리면 catalog 빌드가 깨질 때 host 배포까지 같이 깨진다 — 이 저장소가
증명하려는 독립 배포가 빌드 그래프에서 다시 묶인다(B-3).

이름을 나눠 끊는다. `--filter` 는 `pkg#task` 의존을 필터와 무관하게 끌고 오므로 같은 `build`
이름으로는 못 끊는다(끊으려면 Dockerfile 이 `--only` 같은 플래그로 `turbo.json` 을 되돌려야 하고,
그러면 의도가 두 파일에 흩어진다).

로컬에서 이걸 직접 부를 일은 없다. remote 가 안 떠 있으면 프리렌더가 ECONNREFUSED 로
죽는다 — 그게 `build` 가 감싸주는 부분이다.

### `dev` · `@mfa/host#dev` · `//#dev:wait-remotes`

host 는 remote 가 준비된 뒤에 뜬다.

turbo 로는 "remote dev 가 먼저"를 직접 못 쓴다 — persistent 태스크에는 의존할 수 없기
때문이다(끝나지 않는 태스크에 의존하면 의존하는 쪽이 영영 안 돈다. turbo 가 `persistent: true`
로 그 상황을 막는다). `with` 는 동시 실행이지 순서가 아니다.

그래서 **끝나는** 태스크(`//#dev:wait-remotes`)로 준비를 기다리게 하고 host 만 거기에 의존시킨다.
`dev` 전체에 걸면 remote 도 이 태스크를 기다리게 되어 교착한다 — 대기 태스크는 remote 가
뜨기를 기다리는데 remote 는 대기 태스크가 끝나기를 기다린다.

`//#dev:wait-remotes` 는 `cache: false` 다. 캐시하면 두 번째 실행부터 대기를 건너뛰어 존재
이유가 사라진다. 근거 코드: `scripts/wait-for-remotes.ts`.

### `start`

⚠️ `pnpm start` 는 루트에서 `pnpm build && turbo run start` 로 부른다. **순서가 필요하다.**

host 의 `build` 는 빌드하는 동안 3001/3002 에 정적 서버를 띄운다. 그런데 remote 의 `start` 도
같은 포트다. `turbo run start` 만 부르면 둘이 **동시에** 스케줄되어 EADDRINUSE 로 같이 죽는다
(`start` 는 자기 패키지의 `build` 만 기다린다, B-4b).

먼저 `pnpm build` 로 빌드를 끝내두면 여기서는 캐시 히트라 host 빌드가 실행되지 않고
(따라서 임시 서버도 안 뜨고) remote 만 포트를 잡는다.

### `lint` 는 없다

루트 `pnpm lint` 가 oxlint 를 **저장소 전체에 한 번** 돌린다. 전체를 0.1초 안에 끝내서
패키지별로 쪼개 캐시할 게 없고, 규칙은 루트 `oxlint.config.ts` 한 곳에 overrides 로 모여
있다(ADR-028).

### `typecheck`

패키지별 타입체크. `^build` 로 의존 패키지를 먼저 빌드한다.

### `//#typecheck:scripts`

`scripts/` 는 워크스페이스 패키지가 아니라 루트에 있어서 패키지 태스크에 안 잡힌다.
루트 태스크(`//#…`)로 따로 걸어야 `turbo run typecheck` 에 포함된다.

- `^build` 가 필요한 이유: `stamp-remote-version.ts` 와 `wait-for-remotes.ts` 가
  `@mfa/remote-config` 를 읽는데, 그 패키지는 빌드가 없지만 tsc 가 타입을 풀려면 워크스페이스
  그래프가 서 있어야 한다.
- `inputs` 에 `packages/utils/src/**` 가 있는 이유: `scripts/*.test.ts` 가 `@mfa/utils/test/*` 를
  import 하는데 그 패키지는 **빌드가 없어서** `exports` 가 소스를 그대로 가리킨다 — 헬퍼 소스가
  **이 프로그램 안에** 들어온다(`tsc -p tsconfig.json --listFiles` 로 확인). 빼두면 헬퍼를 깨도
  turbo 가 캐시된 PASS 를 재생한다(F-3). `^build` 로는 안 잡힌다(빌드 태스크가 없으니 건너뛴다).

### `//#typecheck:tests`

`tests/` 도 `scripts/` 와 같은 처지다 — 루트 태스크로 걸어야 `turbo run typecheck` 에 붙는다.

- `^build` 를 걸지 않는다. 테스트는 `vitest.config.ts` 와 `tsconfig.test.json` 의 alias 로
  워크스페이스 패키지의 **`src` 를 직접** 가리키므로 `dist` 가 필요 없다. 걸어두면 테스트 한 줄
  고칠 때마다 전체 빌드를 기다리게 된다.
- `inputs` 에 앱 · 패키지의 src 글롭은 넣지 않는다. 소스 옆 테스트는 **각 패키지 tsconfig 가**
  검사하고, `tsconfig.test.json` 이 include 하는 건 루트 `tests` 와 `vitest.config.ts` 뿐이다 —
  `--listFiles` 로 확인하면 이 프로그램에 그쪽 파일은 하나도 안 들어온다. 넣으면 소스를 고칠
  때마다 영향받을 수 없는 검사의 캐시가 날아간다.

### `test` 가 turbo 에 없는 이유

`pnpm test` 는 turbo 를 거치지 않고 vitest 를 직접 부른다. 패키지별 대응 태스크가 없어서
turbo 가 더해줄 게 캐시뿐인데, 그 대가로 `pnpm test --project=dom` 같은 러너 플래그가 turbo 에
먹혀버린다(`-- --project=dom` 이 된다). 매일 쓰는 쪽을 살렸다.

### `clean`

`cache: false`. 지우는 태스크를 캐시할 이유가 없다.

## 왜 주석이 여기 있나

48차까지 이 내용은 전부 `turbo.json` 안의 주석이었다(220줄 중 151줄). 두 가지가 문제였다.

- **설정이 안 보였다.** 실제 설정은 70줄인데 주석 사이에 흩어져 있었다.
- **에디터가 빨간 줄을 그었다.** `turbo.json` 은 JSON 으로 인식되는데 주석은 JSON 문법이 아니다.
  turbo 자체는 주석을 받아주지만 에디터 · 다른 도구는 아니다.

주석이 함정도 만들었다. 블록 주석 안의 글롭(`**/`)이 주석을 끝내 turbo 파서가 깨졌고(F-2),
`scripts/remote-wiring.test.ts` 는 주석을 걷어내는 파서를 따로 들고 있어야 했다.

`turbo.jsonc` 로 이름만 바꾸는 안도 있었다(turbo 공식 지원). 빨간 줄은 사라지지만 설정이 안
보이는 문제는 그대로라 기각했다. 이제 `turbo.json` 은 **순수 JSON** 이고, 주석을 다시 넣으면
`remote-wiring.test.ts` 의 `JSON.parse` 가 실패한다 — 근거는 이 문서에 쓴다.
