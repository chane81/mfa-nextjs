# 버전 고정 근거

조회일: 2026-08-14 (npm registry 직접 조회) · Tailwind 항목은 2026-08-19 · 테스트 도구는 2026-08-24 조회

## 버전은 어디에 적혀 있나

공용 의존성의 버전 범위는 **`pnpm-workspace.yaml` 의 `catalog:`** 한 곳에 있다.
각 `package.json` 은 `"catalog:"` 로 가리키기만 한다 — 아래 표의 버전을 올릴 때
고칠 파일은 워크스페이스 파일 하나다(근거: ADR-027).

- `catalogMode: strict` 라 `pnpm add` 로 카탈로그를 우회할 수 없다. 우회가 필요하면
  카탈로그를 먼저 고친다.
- 소유자가 하나뿐인 의존성(`@rsbuild/*` · `vite` · `zustand` · 테스트 도구 일체)은
  **카탈로그에 없다.** 그 `package.json` 에 그대로 적는다.
- **`peerDependencies` 에는 `catalog:` 를 쓰지 않는다.** pnpm 12.1.0 의
  `pnpm peers check` 가 해석하지 못해 오탐이 상주한다
  (`docs/05-troubleshooting/01-known-issues.md` K-1). `@mfa/store` · `@mfa/ui` 는
  peer 선언 자체를 뺐다 — 근거는 ADR-027.

## 채택 버전

| 패키지                              | 최신    | 채택         | 비고                          |
| ----------------------------------- | ------- | ------------ | ----------------------------- |
| `next`                              | 16.4.2  | **16.4.2**   | Turbopack 기본 · 보안 하한 ⬇  |
| `react` / `react-dom`               | 19.2.8  | **19.2.8**   |                               |
| `turbo`                             | 2.10.9  | **2.10.9**   |                               |
| `typescript`                        | 7.0.2   | **6.0.3** ⚠️ | 아래 참고                     |
| `oxlint`                            | 1.89.0  | **1.89.0**   | 정확 고정 ⬇                   |
| `oxlint-plugin-eslint`              | 1.89.0  | **1.89.0**   | oxlint 와 같이 올린다         |
| `oxlint-tailwindcss`                | 1.16.0  | **1.16.0**   | 정확 고정 ⬇                   |
| `oxfmt`                             | 0.74.0  | **0.74.0**   | 정확 고정 ⬇                   |
| `eslint-plugin-turbo`               | 2.11.10 | **2.10.9**   | `turbo` 와 묶는다             |
| `vite`                              | 8.2.1   | **8.2.1**    |                               |
| `@vitejs/plugin-react`              | 6.0.5   | **6.0.5**    |                               |
| `@module-federation/vite`           | 1.20.7  | **1.20.7**   | peer `vite ^5~^8`             |
| `@rsbuild/core`                     | 2.1.13  | **2.1.13**   |                               |
| `@rsbuild/plugin-react`             | 2.1.0   | **2.1.0**    |                               |
| `@module-federation/rsbuild-plugin` | 2.8.2   | **2.8.2**    |                               |
| `@module-federation/runtime`        | 2.8.2   | **2.8.2**    | host 가 쓰는 유일한 MF 패키지 |
| `tailwindcss`                       | 4.3.3   | **4.3.3**    | v4 — 설정이 CSS 안에 있다     |
| `@tailwindcss/postcss`              | 4.3.3   | **4.3.3**    | host · cart                   |
| `@tailwindcss/vite`                 | 4.3.3   | **4.3.3**    | catalog                       |
| `zustand`                           | 5.0.15  | **5.0.15**   | `@mfa/store` 전용             |
| `use-sync-external-store`           | 1.6.0   | **1.6.0**    | `zustand/traditional` 의 peer |

### `next` 16.4.2 는 보안 하한이다

16.3.1 에 **인증 없는 RCE 5건**(critical)이 있다 — 이미지 최적화 API(AVIF · SVG),
`next/og` 의 `ImageResponse`, `use cache` 가 타입드 배열을 돌려주는 경로. 전부
`>=16.4.1` 에서 닫힌다. 여기에 SSRF(high) · 캐시 오염(moderate ×3)이 `>=16.3.8` 로
붙는다. 확인: `pnpm audit`, 2026-10-23.

**`sharp` 는 따로 올리지 않는다.** `package.json` 에 선언이 없고 `next` 의
`optionalDependencies` 로 들어온다. `next@16.4.2` 가 `sharp: ^0.35.5` 를 요구하므로
(레지스트리 조회) 카탈로그 한 줄로 둘이 같이 닫힌다 — `overrides` 가 필요 없다.

범위도 같이 올렸다(`^16.3.1` → `^16.4.2`). `^16.3.1` 이 16.4.2 를 이미 허용하지만,
그러면 **락파일이 왜 16.4.2 여야 하는지가 어디에도 안 남는다.** 하한이 곧 근거다.

### `concurrently` 10.0.6 도 보안 하한이다

`shell-quote` 1.9.0 의 명령 주입(critical)을 닫으려고 올렸다. `concurrently@9.2.4` 는
`shell-quote` 를 범위가 아니라 **정확한 `1.9.0`** 으로 박아서 재해석으로 안 움직이고,
`concurrently@10.0.6` 은 `1.12.0` 을 박는다.

**전이 의존을 `overrides` 로 덮지 않고 소유자를 올렸다.** `overrides` 는 "누가 이 버전을
원했나"를 지우므로, 상위를 올릴 수 있으면 그게 먼저다.

메이저 한 칸이라 v10 파괴적 변경을 공식 릴리스 노트로 대조했다 — Node <22 지원 중단,
ESM 전용, prefix 색 기본값 자동, `--name-separator` 제거, API `killOthers` 개명. 이
저장소는 **CLI 로만** 쓰고(`-n` · `-c` · `--kill-others-on-fail`) 그 셋이 v10 에 그대로
있다. `concurrently` 는 dev 에서만 돌아 `build` · `test` 가 안 덮으므로 그 CLI 표면과
연쇄 종료(`--> Sending SIGTERM to other processes..`)를 직접 돌려 확인했다(47차).

## 테스트 도구 (2026-08-24 추가)

| 패키지                        | 최신   | 채택       | 비고                                      |
| ----------------------------- | ------ | ---------- | ----------------------------------------- |
| `vitest`                      | 4.1.11 | **4.1.11** | v4 에서 `vitest.workspace.ts` 는 없어졌다 |
| `@vitest/coverage-v8`         | 4.1.11 | **4.1.11** | 러너와 같은 버전을 맞춘다                 |
| `jsdom`                       | 30.0.1 | **30.0.1** | `dom` 프로젝트 환경                       |
| `@testing-library/react`      | 16.3.2 | **16.3.2** | React 19                                  |
| `@testing-library/dom`        | 10.4.1 | **10.4.1** | 위의 peer                                 |
| `@testing-library/user-event` | 14.6.6 | **14.6.6** | 클릭 · 입력                               |
| `@testing-library/jest-dom`   | 7.0.1  | **7.0.1**  | `toBeInTheDocument` 등 DOM 매처           |
| `@vitejs/plugin-react`        | 6.0.5  | **6.0.5**  | remote-catalog 와 같은 버전               |

전부 **루트 devDependency** 다. 테스트는 소스 옆에 두지만 러너·매처 설정은 루트
`vitest.config.ts` · `tsconfig.test.json` 한 곳에만 있다 — 근거는
`docs/06-testing/01-test-plan.md`.

`react` · `react-dom` · `@types/react*` 도 루트에 추가했다. Testing Library 를 루트에서
해석해야 하기 때문이고, pnpm 이 같은 버전을 같은 실체로 링크하므로 인스턴스는 하나다
(`vitest.config.ts` 의 `resolve.dedupe` 가 그 가정을 명시한다).

## ⚠️ TypeScript 7 을 안 쓴 이유

```
$ npm view typescript-eslint peerDependencies
{ "eslint": "^8.57.0 || ^9.0.0 || ^10.0.0",
  "typescript": ">=4.8.4 <6.1.0" }
```

TypeScript 7(네이티브 포팅)은 `typescript-eslint` 8.67 의 peer 범위 밖이다.
범위 내 최신인 **6.0.3** 을 고정했다.

- `next build` 자체는 TS7 로도 돌 가능성이 있지만, 린트 파이프라인이 통째로 죽는다.
- 재검토: `npm view typescript-eslint peerDependencies` 로 `<7.x` 가 열렸는지 확인.

> **2026-10-25 (49차) 갱신 — 린트는 더 이상 막지 않는다.** 린트를 oxlint 로 옮기면서
> `typescript-eslint` 가 의존성에서 빠졌다(ADR-028). 그 시점 `typescript-eslint@8.72.0`
> 의 peer 도 여전히 `<6.1.0` 이었다 — TS 7 에는 JS compiler API 가 없어서 typescript-eslint
> 쪽에서 할 수 있는 게 없다는 게 메인테이너 입장이다(typescript-eslint#12518).
>
> 남은 확인 거리는 린트가 아니라 나머지 도구다. `@module-federation/dts-plugin@2.8.2` 의
> peer 는 `^7.0.0` 까지 열려 있지만 **TS 7 로 DTS 생성이 실제로 되는지는 확인하지 않았다.**
> Next 16 · Vite 8 · Rsbuild 2 도 마찬가지다. 올리려면 그 셋과 `pnpm mf:types` 를 TS 7 에서
> 돌려본 기록이 먼저 있어야 한다.

## ⚠️ `eslint-plugin-react` 7.37.5 + ESLint 10 충돌

> **ESLint 시절 기록이다.** 49차에 린트를 oxlint 로 옮기면서 이 플러그인은 빠졌다.
> oxlint 는 React 규칙을 Rust 로 내장해 버전 탐지 경로 자체가 없다.

기본 설정(`settings.react.version: "detect"`)으로 두면 린트가 크래시한다.

```
TypeError: Error while loading rule 'react/display-name':
  contextOrFilename.getFilename is not a function
  at resolveBasedir (eslint-plugin-react/lib/util/version.js:31)
  at detectReactVersion (.../version.js:85)
```

**해결**: 버전을 명시해 탐지 경로를 타지 않게 한다.

```js
// packages/eslint-config/react.js
settings: { react: { version: "19.2" } },
```

## oxlint · oxfmt 는 정확한 버전으로 고정한다

`^` 를 붙이지 않는다. 둘 다 아직 **변경이 잦고, semver 가 지켜준다고 볼 수 없다.**

| 패키지          | 근거                                                                                   |
| --------------- | -------------------------------------------------------------------------------------- |
| `oxfmt`         | 0.x 다. 최근 릴리스에도 BREAKING 이 잦다(0.72.0 에서 markdown 포매터 교체)             |
| `oxlint`        | 1.x 지만 JS 플러그인은 alpha 이고 **semver 대상이 아니라고** 설정 스키마에 적혀 있다   |
| `…-eslint`      | oxlint 와 같은 저장소 · 같은 번호로 나온다. 둘을 같이 올린다                           |
| `…-tailwindcss` | 제3자 JS 플러그인이다. 2주에 한 번꼴로 minor 가 나오고, 규칙이 늘면 경고가 새로 생긴다 |

포매터 버전이 움직이면 코드를 한 줄도 안 고쳤는데 `format:check` 가 깨진다. 올릴 때는
`pnpm format` 결과를 **따로 `style:` 커밋**으로 남긴다(49차의 `style: oxfmt 출력으로 다시 맞춘다`
가 그 모양이다).

이 셋은 카탈로그에 올리지 않는다. 루트 `package.json` 하나만 쓴다(ADR-027 의 "소유자가
하나뿐이면 그 `package.json` 에 남긴다"). `eslint-plugin-turbo` 는 예외로 카탈로그에 남는다 —
`turbo` 와 버전을 묶는 이유가 그대로라서다.

## Tailwind 는 세 앱이 같은 버전이어야 한다

`tailwindcss` · `@tailwindcss/postcss` · `@tailwindcss/vite` 를 세 앱과
`@mfa/tailwind-config` 에서 모두 `^4.3.3` 으로 맞춘다. 공유 CSS 를 빌드해 배포하는 대신
**각 앱이 같은 `theme.css` 를 자기 파이프라인에서 컴파일**하기 때문이다
([05-styling.md](../02-architecture/05-styling.md)). 버전이 갈리면 같은 소스에서 서로 다른
유틸리티가 나오고, 그 CSS 들이 한 페이지에 함께 로드된다.

재확인:

```bash
npm view tailwindcss version
```

## Node / 패키지 매니저

```
node    v26.12.1  (이 저장소 요구: >=26.12.1 <27)
pnpm    12.1.0
```

`.nvmrc` 에 `26.12.1` 을 적어 뒀다 — 버전 매니저가 셸에서 알아서 맞춘다.

`packageManager` 필드로 pnpm 12.1.0 을 고정했다. 이미지 셋도 같은 버전을
`npm install -g` 로 깐다 — corepack 을 안 쓰는 이유는 각 Dockerfile 주석 참고.

**12 부터는 이 두 자리를 같이 안 올리면 이미지 빌드가 깨진다.** pnpm 12 는 `packageManager`
핀을 `pnpm-lock.yaml` 의 `packageManagerDependencies` 에 기록하고, `--frozen-lockfile` 은
그 값이 실행 중인 pnpm 과 어긋나면 `ERR_PNPM_FROZEN_LOCKFILE_WITH_OUTDATED_LOCKFILE` 로
실패한다(11 은 기록도 검사도 안 했다). CI 는 `pnpm/setup@v2` 가 `packageManager` 를 읽으므로
따라오지만, Dockerfile 의 `npm install -g pnpm@…` 는 손으로 맞춰야 한다.

brew 로는 아직 12 를 못 받는다 — npm `latest` dist-tag 가 11.24.0 이고 12 는 `next-12`
태그에만 있다(2026-08-30 확인). Homebrew formula 는 `latest` 타르볼을 따라간다. 저장소는
`packageManager` 핀만 보므로 brew 버전과 무관하게 12.1.0 으로 돈다.

node 요구가 next 16 의 `>=20.9.0` 보다 높은 이유는 `packages/remote-config` 다.
빌드 산출물 없이 `.ts` 를 그대로 export 해서 Node 의 타입 스트리핑에 기댄다
(근거: 그 패키지의 `src/index.ts` 상단 주석).

### 왜 26 라인인가 — 24 는 2026-10-20 에 maintenance 로 내려갔다

버전을 고르는 입력이 셋이다. 기능 하한은 ADR-008 이 뒤집히지 않으면 안 움직이고, 보안
하한은 Node 보안 릴리스마다 움직이고, **라인 선택은 LTS 스케줄이 정한다.**

| 입력                | 값              | 근거                                        |
| ------------------- | --------------- | ------------------------------------------- |
| 기능(타입 스트리핑) | 24.19.0         | ADR-008 · `packages/remote-config`          |
| 라인 선택           | **26.x**        | 24 는 maintenance, 26 이 Active LTS 가 된다 |
| 보안(26 라인)       | **26.12.1**     | 2026-10-21 Node 보안 릴리스                 |
| → `engines.node`    | `>=26.12.1 <27` | 라인 안에서 보안 하한 + 상한 `<27`          |

기능 하한(24.19.0)은 **지우지 않는다.** `engines.node` 범위가 그보다 훨씬 위로 올라가서
지금은 가려져 있을 뿐, "왜 20.9.0 이 아닌가"의 답은 여전히 그 숫자다(ADR-008).

`nodejs/Release` 의 `schedule.json` 실측(확인일 2026-10-24):

| 라인 | start      | lts            | maintenance | end        | 비고               |
| ---- | ---------- | -------------- | ----------- | ---------- | ------------------ |
| v24  | 2025-05-06 | 2025-10-28     | 2026-10-20  | 2028-04-30 | **이미 maint.**    |
| v25  | 2025-10-15 | —              | 2026-04-01  | 2026-06-01 | 홀수 · EOL         |
| v26  | 2026-05-05 | **2026-10-28** | 2027-10-20  | 2029-04-30 | Active LTS 가 된다 |
| v27  | 2027-04-22 | 2027-10-20     | —           | 2030-04-30 | alpha 2026-10-28   |

**이 변경은 LTS 진입(2026-10-28)보다 나흘 빠르다.** 그 나흘 동안 26.x 는 형식적으로
Current 다. 그래도 올린 이유는 반대쪽이 더 나쁘기 때문이다 — 24 는 2026-10-20 부로
Active 창이 닫혀서 새 기능·개선 백포트를 받지 않는다. 보안 패치는 2028-04-30 까지
계속 받으므로 24 에 머무는 것이 위험하진 않다. 즉 **급한 전환은 아니었고, 둘 다 안전한
구간에서 라인을 옮긴 것**이다.

maintenance 라인에 머무는 비용은 "패치를 못 받는다"가 아니라 **"패치만 받는다"** 다.
"LTS 라서 24 에 있는다"는 설명은 2026-10-20 부로 수명이 끝났다.

2026-10-21 보안 릴리스는 세 라인(26.x · 24.x · 22.x)에 걸쳐 CVE **10건**을 고쳤다.
**26 라인은 10건 전부에 해당한다** — 24.x 기준이던 8건(High 4 · Medium 3 · Low 1)에
26.x 전용 2건(둘 다 low)이 더해진다. 26 라인 패치 버전은 **26.12.1**(2026-10-21 배포,
`lts=false` — LTS 승격은 2026-10-28). 24 라인은 **24.22.1**(2026-10-20 배포).

⚠️ **라인을 옮기면 CVE 집합이 바뀐다.** 47차에 "26.x 전용이라 우리와 무관"으로 적었던
두 건이 이번에 범위로 들어왔다. 둘 다 26.12.1 에 이미 패치돼 있으므로 **실질 노출은
없지만**, "무관"의 근거가 버전이었다는 점은 기록해 둔다.

| CVE                 | 등급   | 내용                                                              | 이 저장소와의 접점                                |
| ------------------- | ------ | ----------------------------------------------------------------- | ------------------------------------------------- |
| **CVE-2026-111497** | high   | Brotli 디코더 out-of-bounds write → **원격 코드 실행**            | host 가 remote 매니페스트 · SSR 번들을 `fetch` 함 |
| CVE-2026-106069     | high   | 호스트가 느슨하게 IP 로 해석될 때 TLS 인증서 호스트명 우회        | host → remote HTTPS 호출                          |
| CVE-2026-105483     | high   | IP 를 전각 숫자로 쓰면 TLS 인증서 호스트명 우회                   | 같음                                              |
| CVE-2026-105482     | high   | `dns.resolve` 가 NUL 문자에서 이름을 잘라먹음                     | 간접                                              |
| CVE-2026-105481     | medium | keep-alive 소켓이 **요청 전에 쓰인 응답**을 처리함                | host → remote 재사용 커넥션                       |
| CVE-2026-106072     | medium | 비정규 IPv4 호스트명에서 DNS SAN 이 IP 엔드포인트를 인증함        | 같음                                              |
| CVE-2026-106074     | medium | `randomUUID()` · `randomInt()` 엔트로피 캐시가 스냅샷·SEA 에 굳음 | 해당 없음(스냅샷·SEA 안 씀)                       |
| CVE-2026-106073     | low    | `fs.realpathSync` 로 Permission Model 우회                        | 해당 없음(Permission Model 안 씀)                 |
| CVE-2026-106070     | low    | `zlib.ZipFile` 이 헤더 검증 실패 후 공격자 제어 바이트를 반환     | 해당 없음(아래) — **26.x 전용**                   |
| CVE-2026-106071     | low    | Permission Model 와일드카드 radix 조회가 권한을 과다 부여         | 해당 없음(Permission Model 안 씀) — **26.x 전용** |

같이 올라간 번들 의존성: c-ares · ca-cert(eMudhra 중간 CA 침해) · OpenSSL · Undici.

26.x 전용 2건의 접점을 따로 확인했다(실측, 2026-10-24).

- **CVE-2026-106070** 은 Node 내장 `zlib.ZipFile` 결함이다. 저장소 코드에
  `ZipFile` · `node:zlib` · `unzip` 호출이 **하나도 없다**. 이 저장소에서 zip 을 다루는
  유일한 자리는 `pnpm mf:types` 가 remote 타입 아카이브를 푸는 경로인데, 그건
  `@module-federation/dts-plugin` → **`adm-zip@0.6.0`**(userland)이고 Node 내장 API 가
  아니다. 즉 CVE 경로와 다른 구현이다(`adm-zip` 자체의 권고는 별건 — `pnpm audit` 잔여
  목록에 있고 dev 전용이다).
- **CVE-2026-106071** 은 Permission Model(`--allow-fs-read` · `--allow-fs-write`)을
  켠 경우에만 성립한다. 저장소 어디에도 그 플래그가 없다(`apps` · `packages` · `scripts` ·
  `.github` · `Dockerfile` 전수 확인).

**가장 중요한 접점은 Brotli 다.** host 는 remote 의 매니페스트와 SSR 번들(`mf-server.cjs`)을
HTTP 로 받아 **평가한다**. 응답이 `content-encoding: br` 이면 그 디코더를 지난다 —
즉 remote 오리진이 이 저장소가 이미 문서화한 신뢰 경계
([04-remote-lifecycle.md](../02-architecture/04-remote-lifecycle.md))일 뿐 아니라
**Node 디코더 취약점의 입력 경로**이기도 하다.

출처: <https://nodejs.org/en/blog/vulnerability/october-2026-security-releases>
(확인일 2026-10-23, 26.x 전용 2건은 2026-10-24 재확인). 배포일과 `lts` 플래그는
`https://nodejs.org/dist/index.json`, LTS 스케줄은
`https://raw.githubusercontent.com/nodejs/Release/main/schedule.json` 에서 확인했다.

올릴 때 고치는 자리는 **여덟 곳**이다. 숫자가 복제돼 있으니 `grep -rn '26\.12\.1'` 과
`grep -rn '26-slim'` 으로 전수 확인한다.

| 자리                                        | 값                       |
| ------------------------------------------- | ------------------------ |
| `package.json` 의 `engines.node`            | `>=26.12.1 <27`          |
| `.nvmrc`                                    | `26.12.1`                |
| `.github/workflows/ci.yml` (세 job)         | `runtime: node@^26.12.1` |
| `.github/actions/detect-targets/action.yml` | `runtime: node@^26.12.1` |
| 세 `Dockerfile` 의 `ARG NODE_VERSION`       | `26-slim`                |
| `pnpm-workspace.yaml` 카탈로그              | `'@types/node': ^26.6.5` |
| ADR-010                                     | 라인 개정 줄             |
| 이 문서                                     | 위 표                    |

**패치만 올릴 때와 메이저를 옮길 때가 다르다.** 세 `Dockerfile` 은
`ARG NODE_VERSION=26-slim` 으로 **떠 있는 태그**를 쓰므로 패치는 재빌드만 하면 따라온다
(그래서 보안 릴리스 뒤에는 세 이미지를 다시 빌드해야 한다 — 재빌드 없이는 적용되지
않는다). 반면 **메이저를 옮길 때는 그 `ARG` 자체를 고쳐야 한다.** 47차에 Docker 를
손대지 않은 이유가 이것이고, 이번에는 고쳤다.

### Docker 베이스를 26-slim 으로 옮기면 Debian 도 같이 올라간다

레지스트리 실측(확인일 2026-10-24, Docker Hub manifest digest 대조):

| 태그           | 같은 digest 를 공유하는 태그                                |
| -------------- | ----------------------------------------------------------- |
| `node:24-slim` | `24.22.1-slim` · **`24.22.1-bookworm-slim`** · `24.22-slim` |
| `node:26-slim` | `26.12.1-slim` · **`26.12.1-trixie-slim`** · `26.12-slim`   |

즉 Node 24→26 에 **Debian 12(bookworm) → 13(trixie)** 이 끼어 온다. 노출면을 확인했다 —
세 `Dockerfile` 에 `apt-get install` 이 **하나도 없다**(깔는 것은 `npm install -g pnpm@12.1.0`
하나뿐). 그래서 배포판 교체가 닿을 자리가 없다. 네이티브 모듈도 전부 Node-API 선빌드라
glibc 가 올라가는 방향(2.36 → 2.41)은 선빌드 바이너리에 안전하다.

실제로 돌렸다(2026-10-24). `node:26-slim` 안은 Node v26.12.1 · npm 11.20.0 ·
Debian 13(trixie) · glibc 2.41 이고 `git` 은 없다(24-slim 과 같다). `pnpm docker:up` 이
exit 0, 세 컨테이너 전부 healthy, host 가 remote 를 서버에서 렌더해 응답했다.
Dokploy 배포(2026-10-24, `e99b2a0`)도 통과했다 — 세 앱이 같은 `Dockerfile` 로 다시
빌드돼 올라갔고 라이브에서 remote 가 서버 렌더로 들어온다. 상세는
[00-progress.md](../00-progress.md) 48차.

### `@types/node` 는 런타임 메이저를 따라간다

`@types/node` 는 런타임 버전을 **주장하지 않는다** — Node 26 에서 `^24.10.1` 타입으로도
`typecheck` 13/13 이 통과한다(실측). 그래서 안 올려도 조용하다. 그게 문제다: 26 에
추가된 API 가 타입에 안 보이고, 24 에서 빠진 API 가 타입에는 남는다. 카탈로그를
`^26.6.5` 로 올렸다 — `ts6.0` dist-tag 가 가리키는 버전이고(이 저장소 typescript 6.0.3),
2026-10-09 공개다.

**상한(`<27`)이 있는 이유는 다르다.** 27 이상에서 돌려본 적이 없어서다. 상한이 없으면
`engines` 를 통과해 버리고, 실패는 설치 시점이 아니라 dev 서버 한복판이나 프리렌더에서
난다. 27 의 alpha 는 2026-10-28 에 열린다(위 스케줄 표).

27 이상을 검증했으면 이 상한을 올린다. 고칠 자리는 하한과 같은 여덟 곳이다(위 표).

이전 상한은 `<25` 였고 그 의도는 **"검증한 라인 밖을 막는다"** 였다. 짝수·홀수 규칙이
아니다 — 26 은 짝수지만 검증 전에는 똑같이 범위 밖이었다. 그래서 상한을 올릴 때마다
`typecheck` · `lint` · `test` · `build` 를 그 라인에서 실제로 돌린 기록이 같이 있어야 한다
(이번 기록: [00-progress.md](../00-progress.md) 48차).

## 버전 재확인 방법

```bash
for p in next turbo typescript oxlint oxfmt react tailwindcss \
         @tailwindcss/postcss @tailwindcss/vite \
         @module-federation/vite @module-federation/runtime \
         @module-federation/rsbuild-plugin @rsbuild/core \
         @module-federation/nextjs-mf; do
  printf "%-40s %s\n" "$p" "$(npm view "$p" version)"
done
```
