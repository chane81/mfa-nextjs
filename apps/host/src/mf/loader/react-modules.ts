/**
 * host 가 remote 에 넘겨주는 React 모듈의 **이름과 정규화 프로브 표**.
 *
 * ## 왜 여기에 `import * as React` 가 없나 — **있으면 빌드가 깨진다**
 *
 * 이 파일은 브라우저 경로(`./index`)와 서버 경로(`./server`)가 같이 본다. 그런데 서버
 * 경로는 Route Handler(`/api/mf-revalidate`)에서도 닿으므로 **RSC 그래프**에 들어간다.
 * `react-dom/client` 를 여기서 import 하면 그 그래프까지 딸려 들어가고 Next 가 막는다.
 *
 *     You're importing a component that imports react-dom/client. It only works in a
 *     Client Component but none of its parents are marked with "use client" …
 *
 * 그래서 **네임스페이스는 각 경로가 자기 그래프에서 직접 import 하고**, 이 파일은
 * 그래프에 상관없는 것 — 이름 목록과 프로브 — 만 들고 있다. 전에는 프로브가 두 파일에
 * 각각 적혀 있었는데, 한쪽만 어긋나면 그 모듈만 조용히 싱글턴에서 빠지고 증상은 훅이
 * 깨지는 것이라 원인이 설정 한 글자라는 게 안 보였다. 목록이 맞는지는 각 경로의
 * `satisfies` 가 컴파일 타임에 확인한다.
 */

/** host 가 remote 에 내려주는 공유 모듈 버전. React 가 두 번 로드되면 훅이 깨진다. */
export const REACT_VERSION = '19.2.8';

/**
 * 모듈 이름 → **그 모듈이 진짜인지 판별하는 export 이름**.
 *
 * ## 왜 서브엔트리까지 공유하나 — **remote 가 요구하기 때문이다**
 *
 * 루트만 놓고 보면 서브엔트리는 공유할 이유가 없다. `react/jsx-runtime` ·
 * `react/jsx-dev-runtime` · `react-dom/client` 는 전부 내부에서 루트를 `require` 한다.
 *
 * ```js
 * // react/cjs/react-jsx-dev-runtime.development.js
 * var React = require("react");
 * ```
 *
 * 즉 **루트만 싱글턴이면 동작 자체는 성립한다.** 그런데 그건 이 목록을 정하는 근거가
 * 아니다. 근거는 remote 쪽 플러그인이 매니페스트에 무엇을 올리느냐다.
 *
 * 이 목록이 넷이 된 건 catalog 가 Vite(`@module-federation/vite`)였을 때다. 그 플러그인은
 * 선언이 react·react-dom 둘이어도 매니페스트에 서브엔트리를 자동으로 올렸고
 * (react/jsx-runtime · react-dom/client), host 가 그걸 제공하지 않으면 **bridge 단계에서
 * 죽었다.**
 *
 *     [Module Federation] Failed to bridge external shared module "react-dom/client"
 *     [ Federation Runtime ]: Remote container initialization failed. #RUNTIME-015
 *
 * 38차에 catalog 를 Rsbuild 로 옮기면서 **두 remote 의 매니페스트가 둘 다 react·react-dom
 * 둘만 올린다**(실측). 그래서 서브엔트리 셋은 지금은 아무도 요구하지 않는다 — 남겨 둔
 * 것이지 필요해서 있는 게 아니다. 지우려면 프로덕션 빌드만으로 부족하고 **dev 콜드
 * 로드까지** 확인해야 한다(0-4d 교훈).
 *
 * ## ⚠️ 이 목록을 줄이려는 시도는 이미 한 번 실패했다
 *
 * 8차에 `_jsxDEV is not a function`(0-4c)을 **오진해서** 서브엔트리를 여기서 뺐다가
 * 위 `#RUNTIME-015` 를 만났다. 그때 진짜 원인은 공유 목록이 아니라 Vite dev 의 모듈
 * 평가 순서였다. 근거: known-issues 0-4c · 0-4d.
 */
export const SHARED_PROBES = {
  react: 'useState',
  'react-dom': 'createPortal',
  'react-dom/client': 'createRoot',
  'react/jsx-runtime': 'jsx',
  'react/jsx-dev-runtime': 'jsxDEV',
} as const;

export type SharedModuleId = keyof typeof SHARED_PROBES;

/**
 * `import * as X from "..."` 의 결과 모양은 번들러/모드/대상(CJS·ESM)에 따라 달라진다.
 * 어떤 경우엔 `{ jsx, jsxs }`, 어떤 경우엔 CJS interop 때문에 `{ default: { jsx, jsxs } }` 다.
 *
 * 후자를 그대로 remote 에 넘기면 remote 안에서 `_jsxDEV is not a function` 같은 에러가 난다.
 * (Next dev 모드에서 실제 재현 → docs/05-troubleshooting)
 *
 * 기대하는 export 이름을 프로브로 넘기면 실제 모듈 객체를 찾아준다.
 */
export function normalizeModule<T>(mod: T, probe: string): T {
  const ns = mod as Record<string, unknown> | undefined;
  if (ns && typeof ns[probe] === 'function') return mod;

  const inner = ns?.default as Record<string, unknown> | undefined;
  if (inner && typeof inner[probe] === 'function') return inner as T;

  if (process.env.NODE_ENV !== 'production') {
    console.warn(
      `[mfa] 공유 모듈에서 '${probe}' 를 찾지 못했습니다. remote 가 자체 사본을 쓸 수 있습니다.`,
    );
  }
  return mod;
}

/**
 * 넘겨받은 `이름 → 네임스페이스` 표를 **표의 프로브로** 정규화한다.
 *
 * 부르는 쪽은 자기 그래프에서 legal 한 모듈만 담으면 되고, 담은 이름이 표에 있는지는
 * `K extends SharedModuleId` 가 막는다. 부르는 쪽이 자기 목록에 `satisfies` 를 걸면
 * "빠진 키"까지 컴파일 타임에 잡힌다.
 */
export function normalizeShared<K extends SharedModuleId>(
  mods: Record<K, unknown>,
): Record<K, unknown> {
  return Object.fromEntries(
    Object.entries(mods).map(([id, mod]) => [
      id,
      normalizeModule(mod, SHARED_PROBES[id as SharedModuleId]),
    ]),
  ) as Record<K, unknown>;
}
