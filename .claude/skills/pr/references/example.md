# 예시 — 실제 PR 본문

`chane81/mfa-nextjs#13`. 69개 파일 · 934 추가 / 373 삭제짜리 리팩터링이다.

읽을 때 볼 것:

- 첫 두 줄이 **동작 변경 없음**을 바로 밝힌다
- `한눈에` 표가 4행이다. 변경 넷을 그 아래 번호 섹션이 하나씩 받는다
- 각 섹션이 2~4줄이다. 길어질 뻔한 것(기각한 대안 · 되돌린 결정 · 밟은 함정)은 전부 `<details>` 로 갔다
- 핵심이 한 줄인 변경은 `diff` 블록으로 보여준다 — 설명 문장이 없다
- 검증이 산문이 아니라 블록이다

아래가 본문 전문이다.

---

remote 나 컴포넌트를 하나 더 추가할 때 **손으로 고쳐야 하는 곳**을 줄인다.
동작 변경 없음 — 리팩터링과 검사 추가뿐이다.

## 한눈에

| 무엇             | before                            | after                            |
| ---------------- | --------------------------------- | -------------------------------- |
| MF 설정          | 번들러 config **2곳에 복제**      | `remoteFederationConfig()` 한 곳 |
| React 공유 버전  | 문자열이 **3곳**                  | 상수 한 곳 + 런타임에서 읽음     |
| remote 배선 선언 | 잊어도 **조용함**                 | 테스트가 파일·줄까지 알려줌      |
| 테스트 헬퍼      | 루트 `tests/` + tsconfig **10곳** | `@mfa/utils` 패키지, paths 0곳   |

`vite.config.ts` 370 → 264줄 · `rsbuild.config.ts` 159 → 111줄

---

## 1. MF 설정이 두 config 에 복제돼 있었다

Vite 플러그인과 Rsbuild 플러그인은 **같은 옵션 타입**을 받는다. 그런데 그 옵션이 두 설정 파일에 글자 그대로 두 벌 있었다 — `filename`, `shared`, `dts` 5항목, `dev`.

> 문제는 복제 자체가 아니라, **어긋나도 빌드가 통과한다**는 것이다.
> 예: `requiredVersion` 이 갈리면 그 remote 만 자기 React 사본을 받아 훅이 깨진다. 에러는 안 난다.

`remoteFederationConfig(name)` 하나로 모았다. 번들러 config 에는 포트·자산 경로·CSS·dev 미들웨어처럼 **그 번들러 어휘로만 쓸 수 있는 것**만 남는다.

```ts
// apps/remote-*/{vite,rsbuild}.config.ts
const MF = remoteFederationConfig(NAME);
federation(MF.options); // catalog
pluginModuleFederation(MF.options); // cart — 같은 객체
```

같이 상수로 올린 것: `remoteEntry.js` · `^19.0.0` · `.mf-version` · `unversioned`

## 2. host 가 공표하던 React 버전이 손으로 적혀 있었다

```diff
- const REACT_VERSION = '19.2.8';
+ const REACT_VERSION = (MODULES.react as { version: string }).version;
```

MF `shared` 에 실려 나가는 값이다. React 를 올리고 이 줄을 잊으면 **공표한 버전과 실제로 주입하는 모듈이 달라진다.** MF 는 그 문자열로 판정한 뒤 다른 실체를 넘기므로, 에러 없이 remote 안에서만 훅이 깨진다.

주입 대상에서 직접 읽으면 그 상태가 성립하지 않는다.

## 3. remote 를 추가할 때 잊는 자리 셋

`turbo.json` · `docker-compose.yml` · 각 `Dockerfile`. 셋 다 JSON·YAML·빌드 컨텍스트라 SSOT 를 못 읽고, **셋 다 빠뜨려도 조용하다.**

| 잊으면               | 무슨 일이                                    |
| -------------------- | -------------------------------------------- |
| turbo `dependsOn`    | host 프리렌더가 ECONNREFUSED 로 죽는다       |
| compose 배선         | 로컬 도커에서 그 remote 만 없다              |
| Dockerfile 제외 필터 | 빌드는 성공하고 **이미지만 몇 백 MB 커진다** |

`scripts/remote-wiring.test.ts` 가 `REMOTE_LIST` 와 대조한다. 실패하면 어느 파일에 무슨 줄을 넣으라고 말한다.

> Dockerfile 의 `--filter '!@mfa/remote-<다른 remote>'` 는 remote 가 늘 때마다 **다른 모든 remote 의 Dockerfile 이 같이 늘어나는** 유일한 자리다.

## 4. 테스트 헬퍼를 `@mfa/utils` 로 옮겼다

`@tests/*` alias 를 쓰려면 같은 매핑을 **tsconfig 10곳에 복제**해야 했다. 하나라도 빠지면 러너는 통과하는데 편집기만 `ts(2307)` 로 빨개진다.

워크스페이스 패키지로 만들고 `devDependencies` 에 적게 했다. paths 10개 삭제.

- **빌드 없음** — 있으면 turbo `^build` 그래프에 들어가 프로덕션 이미지가 테스트 헬퍼를 먼저 컴파일한다
- **배럴 없음** — 서브패스마다 환경이 다르다 (`test/cookies` = DOM, `test/http` = node)

---

## 검증

```
pnpm build --force   remote 둘 재빌드 + host 프리렌더가 SSR 번들 실행 → 산출물 동일
pnpm mf:types        재수신 후 generated/ 에 diff 없음 (dts 설정이 안 바뀌었다는 뜻)
pnpm test            690 passed
typecheck / lint / format:check / install --frozen-lockfile
```

새 대조 테스트는 음성 확인까지 했다 — `turbo.json` 의 cart 항목을 한 글자 바꾸자 "어느 파일에 무슨 줄" 문장으로 실패했다.

<details>
<summary><b>일부러 안 고친 것</b></summary>

| 무엇                      | 이유                                                                          |
| ------------------------- | ----------------------------------------------------------------------------- |
| `*Section` / `*Slot`      | 레지스트리로 접으면 `PropsOf<K>` 가 죽는다. 클라이언트 경계가 실제로 필요하다 |
| `server-entry.ts` 수동 맵 | 이미 `server-entry.test.tsx` 가 스캔 결과와 대조 중                           |
| CI 워크플로               | 이미 `REMOTE_LIST` · `ciUrlVar` 에서 전부 파생됨                              |

</details>

<details>
<summary><b>배포 예외를 만들었다가 되돌린 이야기</b> (cdb4c8f → d0e6a3f)</summary>

`SHARED_DEPLOY_PATHS` 의 `packages/` 는 통짜 규칙이라, 테스트 헬퍼 한 줄에 세 앱이 재배포된다. 구멍을 파봤다가(`DEPLOY_IGNORED_PATHS`) 되돌렸다.

두 선택의 **사고가 대칭이 아니다.**

| 선택        | 틀렸을 때                        | 언제 알게 되나            |
| ----------- | -------------------------------- | ------------------------- |
| 통짜로 둔다 | 안 바뀐 이미지를 다시 올린다     | 즉시, 무해                |
| 구멍을 판다 | **바뀐 코드가 배포에 안 실린다** | "고쳤는데 반영이 안 된다" |

이름이 `@mfa/utils` 라 더 그렇다 — 범용 이름은 범용으로 쓰이게 되고, 프로덕션 유틸이 하나 들어오는 순간 구멍이 조용한 사고가 된다.

`deploy-targets.test.ts` 가 `packages/utils/` 도 전체 배포를 부르는지 본다.

</details>

<details>
<summary><b>밟은 함정 — JSONC 를 정규식으로 벗기면 안 된다</b></summary>

`turbo.json` 주석을 `/\*[\s\S]*?\*\//g` 로 걷어냈더니, 값에 있는 `".next/**"` 의 `/**` 부터 먹어서 그 아래 태스크가 통째로 사라졌다. 파싱은 엉뚱한 자리에서 깨진다.

```
SyntaxError: Bad control character in string literal in JSON at position 362
```

문자열 안팎을 구분하는 스캐너로 바꿨다.

</details>

## 문서

`ADR-024`(MF 옵션 SSOT) · `ADR-025`(헬퍼 패키지) · 41차 진행 기록 · `.claude/rules/remotes.md` 의 "remote 추가할 때" 표 · 테스트 계획 44·45번 · known-issues H-2·F-3

> 리뷰용 인라인 코멘트 13개를 **Files changed** 에 달아뒀다. diff 만 봐서는 왜 그랬는지 안 보이는 자리들이다.
