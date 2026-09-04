# remote 번들러 비교 — Vite vs Rsbuild

검증일: 2026-09-04
대상 버전: Vite 8.2.1 + `@module-federation/vite` 1.20.7 (catalog) /
`@rsbuild/core` 2.1.13 + `@module-federation/rsbuild-plugin` 2.8.2 (cart)

이 저장소는 remote 두 개를 **일부러 다른 번들러로** 빌드한다. "번들러가 달라도 런타임
계약만 맞으면 host 가 동일하게 소비한다"는 MF 의 주장을 검증하기 위해서다
([02-alternatives.md](./02-alternatives.md#4-왜-rsbuild-remote-도-같이-두었나)).
그 검증은 통과했다 — **둘 다 host 가 똑같이 소비한다.** 이 문서는 그 다음 질문을 다룬다:
_새로 remote 를 만든다면 어느 쪽을 고르나._

## 한 줄 결론

**MF remote 전용이라면 Rsbuild 다.** Vite 가 나쁜 도구라서가 아니라, MF 의 shared 배리어가
webpack/Rspack 런타임 **안에** 있고 Vite 에서는 어댑터가 **밖에서** 흉내내야 하기 때문이다.
이 저장소의 함정 기록이 그 구조 차이를 그대로 반영한다.

## 요약 비교표

| 항목                 | catalog — Vite 8                                              | cart — Rsbuild 2                                    |
| -------------------- | ------------------------------------------------------------- | --------------------------------------------------- |
| MF 플러그인          | `@module-federation/vite` — MF 조직이 관리하는 **어댑터**     | `@module-federation/rsbuild-plugin` — **1급 통합**  |
| shared 배리어 위치   | 어댑터가 만든 가상 모듈. `import()` **뒤**                    | Rspack 런타임 `ensureChunk` **안**                  |
| 콜드 dev 레이스      | **있다** — `_jsxDEV is not a function` (0-4c)                 | 없다                                                |
| 회피 장치            | `server.warmup` + `optimizeDeps` **둘 다** 필요               | 없음                                                |
| dev CSS              | JS 래퍼로 서빙 → `<link>` 로 못 받음. 자작 미들웨어 필요(C-1) | 실제 파일로 나옴. 대응 코드 0                       |
| SSR(node) 번들       | `rollupOptions.output.format: 'cjs'` 수동 조립                | `library: { type: 'commonjs2' }` 한 줄              |
| shared 자동 확장     | `react/jsx-runtime` · `react-dom/client` 를 **몰래 추가**했다 | 선언한 것만 오른다                                  |
| 매니페스트(dev)      | `remoteEntry.js` 뿐 — 게이트가 실제 청크를 못 봄              | 실제 청크 경로를 다 싣는다                          |
| 설치                 | 순수 JS                                                       | **네이티브 바이너리**(`@rspack/binding-*`) — 이슈 8 |
| 설정 코드 줄 수(웹)  | 140줄                                                         | 78줄                                                |
| 설정 코드 줄 수(SSR) | 23줄                                                          | 29줄                                                |

줄 수 측정: `grep -vE '^\s*($|//|/\*|\*)' <config> | grep -c ""` (빈 줄·주석 제외).
주석까지 세면 Vite 411줄 / Rsbuild 209줄이다 — 주석 대부분이 **함정 해설**이라는 점이
그 자체로 하나의 지표다.

## 왜 갈리나 — 배리어가 런타임 안이냐 밖이냐

이게 나머지 차이를 전부 낳는 단 하나의 원인이다.

### Vite — 어댑터가 순서를 손으로 만든다

`@module-federation/vite` 1.20.7 이 생성하는 expose 로더:

```js
// virtual:mf-exposes:…
"./ProductGrid": async () => {
  await Promise.all([])                                  // ← 비어 있다
  const importModule = await loadExposedModule(
    "./ProductGrid",
    () => import("/src/exposes/ProductGrid.tsx")          // ← 여기서 loadShare 가 평가된다
  )
  if (dependencyPending?.then) await dependencyPending;   // ← 배리어가 import 뒤
}
```

`ProductGrid.tsx` 는 automatic JSX runtime 때문에 `jsxDEV` 를 **정적 import** 한다.
그래서 `import()` 되는 순간 loadShare 모듈이 평가되고, 그 시점에 공유 스코프가 비어 있으면
`jsxDEV` 가 `undefined` 인 채로 굳는다. 뒤늦게 배리어를 await 해도 이미 늦다.

콜드 로드 실측(ms):

```
280→285  /src/exposes/ProductGrid.tsx
286→293  loadShare(react/jsx-dev-runtime)     ← 캐시 miss, undefined 로 굳는다
311→313  .vite/deps/react_jsx-dev-runtime.js  ← 실제 모듈은 20ms 뒤
```

### Rspack — 배리어가 청크 로드 파이프라인의 일부다

```
container.get(id)
  → __webpack_require__.e(chunkId)
      → __webpack_require__.f.consumes   ← shared 해석이 여기, ensureChunk 안
      → __webpack_require__.f.j          ← 청크 로드
  → 그 다음에야 모듈 팩토리 실행
```

`consumes` 핸들러가 `ensureChunk` 의 구성원이라, **모듈 팩토리가 도는 시점엔 shared 가 이미
해석 완료**다. 순서가 코드 생성 규칙으로 보장되므로 레이스가 성립하지 않는다.

### "Rsbuild 는 미리 다 컴파일해서" 가 아니다

흔한 오해라 명시해 둔다. Rsbuild 의 `dev.lazyCompilation` 기본값은

```js
const defaultOptions = { imports: true, entries: false };
```

즉 **동적 import 는 기본으로 지연 컴파일**이고, cart 설정도 플러그인도 이걸 끄지 않는다
(`@module-federation/rsbuild-plugin` 2.8.2 의 `dist` 전체에 `lazyCompilation` 언급 0건).
cart 역시 "요청 시점에 컴파일" 을 한다.

그런데도 레이스가 없는 이유는 지연 컴파일이 **요청을 지연시킬 뿐 순서를 바꾸지 않기**
때문이다. 컴파일이 언제 끝나든 `consumes` 는 여전히 팩토리 실행보다 앞이다.
반대로 Vite 쪽 워밍은 "레이스 구간을 좁혀 지게 만드는" 확률적 회피다 —
실측도 그 성격을 드러낸다.

> 워밍 없이 2/2 실패, 워밍 후 4/4 성공 (dev 재시작 + 새 브라우저 세션 기준)

머신이 느려지거나 expose 가 커지면 다시 깨질 수 있는 종류다. 근본 해결은 상류에서
배리어 순서를 고쳐야 나온다.

## 이 저장소가 밟은 함정의 분포

[05-troubleshooting/01-known-issues.md](../05-troubleshooting/01-known-issues.md) 기준.

| 항목                                                                                                                                                                                   | 원인 번들러 |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| [0-4c. 콜드 dev 첫 로드에서 `_jsxDEV` is not a function](../05-troubleshooting/01-known-issues.md#0-4c-콜드-dev-첫-로드에서-_jsxdev-is-not-a-function)                                 | Vite        |
| [0-4d. host 가 서브엔트리 공유를 빼면 Vite remote 가 깨진다](../05-troubleshooting/01-known-issues.md#0-4d-host-가-서브엔트리-공유를-빼면-vite-remote-가-깨진다)                       | Vite        |
| [C-1. dev 에서 Vite remote 의 CSS 를 브라우저가 통째로 무시한다](../05-troubleshooting/01-known-issues.md#c-1-dev-에서-vite-remote-의-css-를-브라우저가-통째로-무시한다)               | Vite        |
| [H-2. dev 워밍 glob 이 테스트 파일까지 잡아 사전 transform 이 실패했다](../05-troubleshooting/01-known-issues.md#h-2-dev-워밍-glob-이-테스트-파일까지-잡아-사전-transform-이-실패했다) | Vite        |
| [I-3. `extractThirdParty` 는 ESM 전용 워크스페이스 패키지를 못 집는다](../05-troubleshooting/01-known-issues.md#i-3-extractthirdparty-는-esm-전용-워크스페이스-패키지를-못-집는다)     | Vite        |
| [8. pnpm 설치 중 rspack 바이너리 타임아웃](../05-troubleshooting/01-known-issues.md#8-pnpm-설치-중-rspack-바이너리-타임아웃)                                                           | Rsbuild     |

Vite 쪽 다섯 개는 전부 **MF 통합 지점**에서 났다. Rsbuild 쪽 하나는 MF 와 무관한
**네이티브 바이너리 설치** 문제다 — 성격이 다르다.

## Rsbuild 쪽 대가 (공정하게)

기울어진 표만 남기지 않기 위해 반대편도 적는다.

| 대가                           | 내용                                                                                                |
| ------------------------------ | --------------------------------------------------------------------------------------------------- |
| 네이티브 바이너리              | `@rspack/binding-*` 다운로드가 막히면 설치 자체가 멈춘다 (이슈 8). 사내망·CI 에서 실제 발생         |
| `externals` 를 손으로 조립     | `SSR_EXTERNALS.map((id) => [id, \`commonjs ${id}\`])` — Rspack 이 "어떤 형태로 가져올지"까지 받는다 |
| 출력 경로를 계약에 맞춰 눌러야 | `distPath.css: ''` — 기본이 `static/css/` 라 그대로 두면 host 의 주소 조립식이 갈라진다             |
| 생태계                         | Vite 플러그인 생태계가 더 넓다. `@tailwindcss/vite` 같은 1급 통합은 Rsbuild 에선 postcss 경유       |

다만 이 넷은 전부 **한 번 적으면 끝나는 잡일**이다. Vite 쪽 다섯은 런타임 레이스이거나
확률적 회피다. 비용의 종류가 다르다.

### Vite 를 고르는 게 맞는 경우

- remote 가 **독립 실행 앱**을 겸하고 dev HMR 체감이 중요할 때.
  단 remote 는 host 페이지 안에서 로드되므로 **HMR 이점 대부분을 못 쓴다** —
  Vite 의 자동 새로고침이 host 페이지에는 오지 않는다(그래서 `optimizeDeps` 사전 번들링이
  필요했다).
- Vite 전용 플러그인에 의존이 이미 깊을 때.

## 산출물 확인

MF 인지가 실제로 동작한다는 증거. `remoteEntry.js` 가 청크 분할에 휩쓸리지 않고 루트에
온전히 하나 있고, expose 는 각자 async 청크로 떨어진다.

```
$ find apps/remote-cart/dist -name "*.js"
apps/remote-cart/dist/vtmtldbyh7/remoteEntry.js
apps/remote-cart/dist/vtmtldbyh7/static/js/index.10fedcf7ad.js
apps/remote-cart/dist/vtmtldbyh7/static/js/async/__federation_expose_CartBadge.448a416dc8.js
apps/remote-cart/dist/vtmtldbyh7/static/js/async/__federation_expose_CartPanel.c195c3ed00.js
apps/remote-cart/dist/vtmtldbyh7/static/js/async/__federation_expose_CheckoutFlow.f982be0147.js
…
```

## 그래서 이 저장소는 어떻게 하나

**바꾸지 않는다.** 두 번들러 공존이 곧 실험 대상이고, catalog 를 Rsbuild 로 옮기면
"번들러가 달라도 된다"는 검증이 사라진다. catalog 의 Vite 삽질 기록은 이 저장소에서
가장 값진 산출물 중 하나다 — 지우지 않는다.

선택 지침만 남긴다.

| 상황                            | 고를 것                              |
| ------------------------------- | ------------------------------------ |
| MF remote 를 새로 만든다        | **Rsbuild**                          |
| 이 저장소에 remote 를 더 붙인다 | 번들러를 또 늘리지 말고 둘 중 하나   |
| 기존 Vite 앱을 remote 로 바꾼다 | Vite 유지 + 이 문서의 회피 장치 복사 |

## 출처

- [Rsbuild — Lazy Compilation](https://rsbuild.rs/config/dev/lazy-compilation) (context7 조회, 2026-09-04)
- [Rsbuild — Module Federation 가이드](https://rsbuild.rs/guide/advanced/module-federation)
- [@module-federation/vite — npm](https://www.npmjs.com/package/@module-federation/vite)
- [Vite — server.warmup](https://vite.dev/config/server-options#server-warmup)
- 어댑터 생성 코드 · 실측 타임라인: `apps/remote-catalog/vite.config.ts` 의 `server.warmup` 주석
