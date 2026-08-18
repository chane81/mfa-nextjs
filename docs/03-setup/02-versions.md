# 버전 고정 근거

조회일: 2026-08-14 (npm registry 직접 조회)

## 채택 버전

| 패키지                              | 최신   | 채택         | 비고                          |
| ----------------------------------- | ------ | ------------ | ----------------------------- |
| `next`                              | 16.3.1 | **16.3.1**   | Turbopack 기본                |
| `react` / `react-dom`               | 19.2.8 | **19.2.8**   |                               |
| `turbo`                             | 2.10.9 | **2.10.9**   |                               |
| `typescript`                        | 7.0.2  | **6.0.3** ⚠️ | 아래 참고                     |
| `eslint`                            | 10.8.1 | **10.8.1**   | flat config                   |
| `typescript-eslint`                 | 8.67.0 | **8.67.0**   | eslint 10 지원                |
| `vite`                              | 8.2.1  | **8.2.1**    |                               |
| `@vitejs/plugin-react`              | 6.0.5  | **6.0.5**    |                               |
| `@module-federation/vite`           | 1.20.7 | **1.20.7**   | peer `vite ^5~^8`             |
| `@rsbuild/core`                     | 2.1.13 | **2.1.13**   |                               |
| `@rsbuild/plugin-react`             | 2.1.0  | **2.1.0**    |                               |
| `@module-federation/rsbuild-plugin` | 2.8.2  | **2.8.2**    |                               |
| `@module-federation/runtime`        | 2.8.2  | **2.8.2**    | host 가 쓰는 유일한 MF 패키지 |
| `eslint-plugin-react`               | 7.37.5 | **7.37.5**   | ⚠️ 아래 참고                  |
| `eslint-plugin-react-hooks`         | 7.1.1  | **7.1.1**    | eslint 10 OK                  |

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

## ⚠️ `eslint-plugin-react` 7.37.5 + ESLint 10 충돌

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

## Node / 패키지 매니저

```
node    v24.19.0  (이 저장소 요구: >=24.19.0 <25)
pnpm    11.22.0
```

`.nvmrc` 에 `24.19.0` 을 적어 뒀다 — 버전 매니저가 셸에서 알아서 맞춘다.

`packageManager` 필드로 pnpm 11.22.0 을 고정했다. 이미지 셋도 같은 버전을
`npm install -g` 로 깐다 — corepack 을 안 쓰는 이유는 각 Dockerfile 주석 참고.

node 요구가 next 16 의 `>=20.9.0` 보다 높은 이유는 `packages/remote-config` 다.
빌드 산출물 없이 `.ts` 를 그대로 export 해서 Node 의 타입 스트리핑에 기댄다
(근거: 그 패키지의 `src/index.ts` 상단 주석).

**상한(`<25`)이 있는 이유는 다르다.** 25 이상에서 돌려본 적이 없어서다. 상한이 없으면
`engines` 를 통과해 버리고, 실패는 설치 시점이 아니라 dev 서버 한복판이나 프리렌더에서
난다. 실제로 이 저장소를 clone 하는 흔한 환경 하나가 이미 범위 밖이다 —
`brew install node` 는 최신 메이저(현재 v26.x)를 깐다.

25 이상을 검증했으면 이 상한을 올린다. 고칠 곳은 `package.json` 의 `engines.node`,
`.nvmrc`, 그리고 이 문서다.

## 버전 재확인 방법

```bash
for p in next turbo typescript eslint react \
         @module-federation/vite @module-federation/runtime \
         @module-federation/rsbuild-plugin @rsbuild/core \
         @module-federation/nextjs-mf; do
  printf "%-40s %s\n" "$p" "$(npm view "$p" version)"
done
```
