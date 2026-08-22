import {
  init,
  loadRemote as federationLoadRemote,
} from '@module-federation/runtime';
import * as React from 'react';
import * as ReactJSXDevRuntime from 'react/jsx-dev-runtime';
import * as ReactJSXRuntime from 'react/jsx-runtime';
import * as ReactDOM from 'react-dom';
import * as ReactDOMClient from 'react-dom/client';

import {
  REMOTE_NAMES,
  type RemoteModuleId,
  type RemoteModuleMap,
  type RemoteName,
} from '@mfa/contracts';

import { normalizeModule } from './interop';
import { WEB_ENTRIES } from './remote-endpoints';
import { loadRemoteModuleOnServer } from './server-loader';

/**
 * Next.js 16(Turbopack) host 의 Module Federation 진입점.
 *
 * 같은 `loadRemoteModule(id)` 호출이 실행 환경에 따라 두 경로로 갈린다.
 *
 *   브라우저 → @module-federation/runtime + remote 의 웹 번들(remoteEntry/manifest)
 *   서버     → server-loader.ts + remote 의 node 타깃 CJS 번들(mf-server.cjs)
 *
 * 덕분에 remote 가 **SSR 된다**. 초기 HTML 에 remote UI 가 그대로 들어간다.
 * host 에는 여전히 번들러 플러그인이 없다 — Turbopack 은 MF 를 몰라도 된다.
 */

/** host 가 remote 에 내려주는 공유 모듈 버전. React 가 두 번 로드되면 훅이 깨진다. */
const REACT_VERSION = '19.2.8';

/**
 * ## 왜 `react` / `react-dom` **루트만** 공유하나
 *
 * `react/jsx-runtime`, `react/jsx-dev-runtime`, `react-dom/client` 는 전부
 * 내부에서 루트 패키지를 `require` 한다. 예:
 *
 * ```js
 * // react/cjs/react-jsx-dev-runtime.development.js
 * var React = require("react");
 * ```
 *
 * 즉 **루트만 싱글턴이면 서브엔트리는 각 remote 사본을 써도 안전하다.**
 * 반대로 서브엔트리까지 공유하면, host 가 넘기는 네임스페이스 모양이
 * 번들러/모드마다 달라(`{jsxDEV}` vs `{default:{jsxDEV}}`) remote 에서
 * `_jsxDEV is not a function` 이 터진다. 실제로 dev 모드에서 재현됐다.
 *
 * 서브엔트리를 공유 목록에서 빼는 것이 근본 해결이다.
 * 루트 두 개는 방어적으로 형태를 정규화해서 넘긴다.
 */

/**
 * 브라우저 MF `shared` 목록. **모듈 하나에 다른 건 프로브뿐**이라 표로 적는다.
 *
 * `version` · `scope` · `shareConfig` 는 다섯 항목이 전부 같은 값이었고, 손으로 다섯 번
 * 반복하면 하나만 다르게 적혀도 그 모듈만 조용히 싱글턴에서 빠진다 — 증상은 훅이
 * 깨지는 것이고 원인은 설정 한 글자다.
 *
 * 프로브는 "이 네임스페이스가 진짜 모듈인지" 판별하는 데 쓴다. `import * as X` 의 결과
 * 모양이 번들러·모드·대상(CJS·ESM)에 따라 `{jsx}` 이기도 `{default:{jsx}}` 이기도
 * 해서다 — 근거는 `[[interop]]`.
 */
const SHARED_MODULES = [
  ['react', React, 'useState'],
  ['react-dom', ReactDOM, 'createPortal'],
  ['react-dom/client', ReactDOMClient, 'createRoot'],
  ['react/jsx-runtime', ReactJSXRuntime, 'jsx'],
  ['react/jsx-dev-runtime', ReactJSXDevRuntime, 'jsxDEV'],
] as const;

const SHARED = Object.fromEntries(
  SHARED_MODULES.map(([id, mod, probe]) => [
    id,
    {
      version: REACT_VERSION,
      scope: 'default',
      lib: () => normalizeModule(mod, probe),
      shareConfig: { singleton: true, requiredVersion: '^19.0.0' },
    },
  ]),
);

let initialized = false;

/**
 * 서버가 이 HTML 을 만들 때 쓴 remote 엔트리를 그대로 쓴다.
 * (`RemoteVersionSync` 가 `window.__MFA_REMOTE_VERSIONS__` 로 심어준다)
 *
 * 목적은 **서버 마크업과 hydrate 하는 코드를 같은 빌드로 맞추는 것**이다.
 * 캐시된 HTML 이 오래 살아 있을수록 이 창이 벌어지고, 어긋나면 hydration 이 깨진다.
 *
 * remote 가 웹 자산을 `/v<version>/` 불변 경로로 배포하므로, 이 URL 이 나중에
 * 다른 코드를 가리키게 되는 일은 없다. 값이 없으면(dev 등) 버전 없는 엔트리로 폴백한다.
 */
interface InjectedEntry {
  version: string;
  entry: string;
}

/** 서버가 심어준 값 하나. 없으면 `undefined` — 폴백 판단은 부르는 쪽이 한다. */
function injectedEntry(remote: RemoteName): InjectedEntry | undefined {
  return (
    globalThis as { __MFA_REMOTE_VERSIONS__?: Record<string, InjectedEntry> }
  ).__MFA_REMOTE_VERSIONS__?.[remote];
}

/**
 * ⚠️ 폴백(`WEB_ENTRIES`)은 **dev 에서만 실재하는 주소**다.
 *
 * dev 서버는 `/mf-manifest.json` 을 루트에서 내려주지만, 배포된 remote 의 루트에는
 * `mf-version.json` 하나뿐이고 나머지는 전부 `/v<version>/` 아래다. 그래서 배포에서
 * 폴백 URL 을 그대로 부르면 404 다 — 게다가 404 응답에는 CORS 헤더가 없어서 브라우저에는
 * `Failed to fetch` 라는 네트워크 오류로 보인다(원인이 URL 이라는 힌트가 안 나온다).
 *
 * remote 를 부르는 쪽은 전부 이 함수를 거쳐야 한다. 진단 화면도 마찬가지다.
 */
export function pinnedEntry(remote: RemoteName): string {
  return injectedEntry(remote)?.entry ?? WEB_ENTRIES[remote];
}

/** 버전 핀이 실제로 꽂혔는지. 진단이 "폴백을 보고 있다"를 구분해 보여주는 데 쓴다. */
export function pinnedVersion(remote: RemoteName): string | null {
  return injectedEntry(remote)?.version ?? null;
}

function ensureInit(): void {
  if (initialized) return;

  init({
    name: 'host',
    remotes: REMOTE_NAMES.map((name) => ({ name, entry: pinnedEntry(name) })),
    // host 가 이미 가진 React 를 remote 에 주입 → remote 번들의 React 는 로드되지 않는다
    shared: SHARED,
  });

  initialized = true;
}

const clientCache = new Map<RemoteModuleId, Promise<unknown>>();

function loadOnClient<K extends RemoteModuleId>(
  id: K,
): Promise<RemoteModuleMap[K]> {
  ensureInit();
  const cached = clientCache.get(id);
  if (cached) return cached as Promise<RemoteModuleMap[K]>;

  const promise = federationLoadRemote(id).then((mod) => {
    if (!mod) throw new Error(`remote 모듈 '${id}' 이(가) 비어 있습니다`);
    return mod as RemoteModuleMap[K];
  });

  clientCache.set(id, promise);
  return promise;
}

/**
 * 타입 안전한 remote 모듈 로더 (isomorphic).
 * 서버/브라우저 어느 쪽에서 호출해도 같은 모양의 `{ default: Component }` 를 돌려준다.
 */
export function loadRemoteModule<K extends RemoteModuleId>(
  id: K,
): Promise<RemoteModuleMap[K]> {
  if (typeof window === 'undefined') return loadRemoteModuleOnServer(id);
  return loadOnClient(id);
}

/**
 * 진단·에러 화면이 "어느 주소를 보고 있었는지" 를 표시할 때 쓴다.
 * 버전 고정(`pinnedEntry`) 이전의 설정값이라 여기가 곧 "설정상 기대 주소"다.
 */
export { WEB_ENTRIES as REMOTE_ENTRIES } from './remote-endpoints';
