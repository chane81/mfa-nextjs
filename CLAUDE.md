# mfa-nextjs

Next.js 16 에서 **런타임 Module Federation + remote SSR** 이 되는지 검증하는 실험 저장소.
host(Next 16 / Turbopack) 1 + remote 2(catalog = Vite 8, cart = Rsbuild 2), pnpm + Turborepo.
`@module-federation/nextjs-mf` 는 Next 16 을 지원하지 않는다 — host 는 **번들러 플러그인 없이**
`@module-federation/runtime` 만 쓴다.

## 이 파일을 짧게 유지한다

루트 `CLAUDE.md` 는 **매 세션 전량 로드**된다. 그래서 여기엔 항상 필요한 것만 둔다.

| 종류               | 두는 곳              | 로드 시점                       |
| ------------------ | -------------------- | ------------------------------- |
| 항상 필요한 규칙   | 이 파일              | 매 세션                         |
| 영역별 규칙        | `.claude/rules/*.md` | 그 `paths` 에 맞는 파일 열 때만 |
| 배경 · 근거 · 실측 | `docs/` (아래 표)    | 사람이나 Claude 가 읽을 때만    |
| 앱 한정 규칙       | 그 앱의 `CLAUDE.md`  | 그 디렉터리 파일 읽을 때만      |

`@` 로 시작하는 경로를 백틱 밖에 쓰면 **import 로 해석되어 시작 시 통째로 로드된다**.
문서를 가리킬 때는 링크나 백틱만 쓴다(공식 문서: import 는 정리에 도움될 뿐 컨텍스트를 줄이지 않는다).

현재 규칙 파일과 그 적용 범위:

| 규칙                          | 언제 로드되나                                      |
| ----------------------------- | -------------------------------------------------- |
| `.claude/rules/mf-runtime.md` | `apps/host/src/mf` · `remote-config` · `contracts` |
| `.claude/rules/remotes.md`    | `apps/remote-*` · `scripts`                        |
| `.claude/rules/styling.md`    | `tailwind-config` · `ui` · `*.css` · postcss 설정  |
| `.claude/rules/docs.md`       | `docs/` · `README.md`                              |

## 절대 규칙

- Node `>=24.19.0 <25`, pnpm 12.x. 범위 밖이면 `pnpm install` 이 먼저 막는다.
- 문서 · 주석 · 커밋 메시지는 **한글**. 변수 · 함수명은 영문.
- 라이브러리 API 는 기억으로 쓰지 않는다. `package.json` 의 실제 버전 확인 → context7 조회 → 근거 밝히기.
- 마크다운 · 코드를 고쳤으면 `pnpm format`. CI 가 `format:check` 로 막는다.
- 커밋은 목적별로 나눈다. push 는 별도 요청 없으면 하지 않는다.
- **SSOT 를 복제하지 않는다.** remote 배치는 `packages/remote-config`, remote 모듈 타입은
  `packages/contracts`, 런타임 공유 상태는 `packages/store`, 디자인 토큰은
  `packages/tailwind-config` 한 곳에만 있다.

## 명령

| 명령             | 하는 일                                                               |
| ---------------- | --------------------------------------------------------------------- |
| `pnpm dev`       | 프로세스 5개(host 1 + remote 2 × web·ssr). host 는 remote 를 기다린다 |
| `pnpm build`     | 전체 빌드. **host 프리렌더가 remote SSR 번들을 실제로 실행한다**      |
| `pnpm test`      | Vitest 4. `--project=unit`(node) / `--project=dom`(jsdom) 로 좁힌다   |
| `pnpm lint`      | ESLint 10 flat config                                                 |
| `pnpm typecheck` | 네트워크 없이 돈다 (DTS 를 끈 이유)                                   |
| `pnpm format`    | prettier                                                              |

`pnpm build` 통과 = "Next 16 에서 런타임 MF + SSR 이 된다"는 이 저장소의 주장이 아직 참이라는 뜻이다.
그래서 빌드 실패를 우회하지 말고 원인을 고친다.

## 뭔가 안 될 때 · 배경이 필요할 때

| 알고 싶은 것                        | 읽을 파일                                     |
| ----------------------------------- | --------------------------------------------- |
| 전체 지도 · 6줄 요약                | `docs/README.md`                              |
| **구조를 그림으로** (배포 · 런타임) | `docs/anatomy.html` (브라우저로 연다)         |
| 회차별 작업 기록 · 다음에 할 것     | `docs/00-progress.md`                         |
| **에러 증상으로 원인 찾기**         | `docs/05-troubleshooting/01-known-issues.md`  |
| 아키텍처 결정과 기각 사유(ADR)      | `docs/02-architecture/01-decision.md`         |
| 패키지 구조 · remote 계약           | `docs/02-architecture/02-topology.md`         |
| SSR · 소프트 내비게이션 설계        | `docs/02-architecture/03-ssr-and-soft-nav.md` |
| 버전 공표 · 캐시 무효화 · 신뢰 경계 | `docs/02-architecture/04-remote-lifecycle.md` |
| 스타일링 전략                       | `docs/02-architecture/05-styling.md`          |
| **host `src/mf` 폴더 배치**         | `docs/02-architecture/06-host-mf-layout.md`   |
| 버전 고정 근거                      | `docs/03-setup/02-versions.md`                |
| 테스트를 어디에 어떻게 쓰나         | `docs/06-testing/01-test-plan.md`             |

**추측하기 전에 먼저 트러블슈팅 문서의 "증상으로 찾기" 표를 본다.** 여기 있는 문제는
대부분 한 번 이상 밟은 것이고, 재현 조건과 오진 기록까지 남아 있다.

## 작업이 끝나면 문서를 갱신한다

이 저장소의 산출물은 코드가 아니라 **기록**이다. 코드만 고치고 끝내지 않는다.

| 무엇을 했나          | 어디에 남기나                                                             |
| -------------------- | ------------------------------------------------------------------------- |
| 회차 단위 작업       | `docs/00-progress.md` 맨 위에 새 절                                       |
| 함정을 밟았다        | `docs/05-troubleshooting/01-known-issues.md` — 본문 + **증상 색인 한 줄** |
| 설계 판단을 바꿨다   | `docs/02-architecture/01-decision.md` 에 ADR                              |
| 의존성 버전을 올렸다 | `docs/03-setup/02-versions.md`                                            |
| 테스트를 추가했다    | `docs/06-testing/01-test-plan.md` 의 체크박스                             |

문서 커밋은 코드 커밋과 분리한다(`docs:` 접두사).
