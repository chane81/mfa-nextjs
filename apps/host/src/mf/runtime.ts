import {
  init,
  loadRemote as federationLoadRemote,
} from '@module-federation/runtime';
import * as React from 'react';
import * as ReactJSXDevRuntime from 'react/jsx-dev-runtime';
import * as ReactJSXRuntime from 'react/jsx-runtime';
import * as ReactDOM from 'react-dom';
import * as ReactDOMClient from 'react-dom/client';

import type { RemoteModuleId, RemoteModuleMap } from '@mfa/contracts';

import { normalizeModule } from './interop';
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

const CATALOG_ENTRY =
  process.env.NEXT_PUBLIC_REMOTE_CATALOG_ENTRY ??
  'http://localhost:3001/mf-manifest.json';
const CART_ENTRY =
  process.env.NEXT_PUBLIC_REMOTE_CART_ENTRY ??
  'http://localhost:3002/mf-manifest.json';

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

function pinnedEntry(remote: 'catalog' | 'cart', fallback: string): string {
  const injected = (
    globalThis as { __MFA_REMOTE_VERSIONS__?: Record<string, InjectedEntry> }
  ).__MFA_REMOTE_VERSIONS__;
  return injected?.[remote]?.entry ?? fallback;
}

function ensureInit(): void {
  if (initialized) return;

  init({
    name: 'host',
    remotes: [
      { name: 'catalog', entry: pinnedEntry('catalog', CATALOG_ENTRY) },
      { name: 'cart', entry: pinnedEntry('cart', CART_ENTRY) },
    ],
    // host 가 이미 가진 React 를 remote 에 주입 → remote 번들의 React 는 로드되지 않는다
    shared: {
      react: {
        version: REACT_VERSION,
        scope: 'default',
        lib: () => normalizeModule(React, 'useState'),
        shareConfig: { singleton: true, requiredVersion: '^19.0.0' },
      },
      'react-dom': {
        version: REACT_VERSION,
        scope: 'default',
        lib: () => normalizeModule(ReactDOM, 'createPortal'),
        shareConfig: { singleton: true, requiredVersion: '^19.0.0' },
      },
      'react-dom/client': {
        version: REACT_VERSION,
        scope: 'default',
        lib: () => normalizeModule(ReactDOMClient, 'createRoot'),
        shareConfig: { singleton: true, requiredVersion: '^19.0.0' },
      },
      'react/jsx-runtime': {
        version: REACT_VERSION,
        scope: 'default',
        lib: () => normalizeModule(ReactJSXRuntime, 'jsx'),
        shareConfig: { singleton: true, requiredVersion: '^19.0.0' },
      },
      'react/jsx-dev-runtime': {
        version: REACT_VERSION,
        scope: 'default',
        lib: () => normalizeModule(ReactJSXDevRuntime, 'jsxDEV'),
        shareConfig: { singleton: true, requiredVersion: '^19.0.0' },
      },
    },
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

/** HMR / 재시도 시 브라우저 캐시를 비운다 */
export function invalidateRemoteCache(id?: RemoteModuleId): void {
  if (id) clientCache.delete(id);
  else clientCache.clear();
}

export const REMOTE_ENTRIES = {
  catalog: CATALOG_ENTRY,
  cart: CART_ENTRY,
} as const;
