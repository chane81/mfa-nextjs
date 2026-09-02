import {
  init,
  loadRemote as federationLoadRemote,
} from '@module-federation/runtime';
import * as React from 'react';
import * as ReactJSXDevRuntime from 'react/jsx-dev-runtime';
import * as ReactJSXRuntime from 'react/jsx-runtime';
import * as ReactDOM from 'react-dom';
import * as ReactDOMClient from 'react-dom/client';

import { REMOTE_NAMES, type RemoteName } from '@mfa/contracts';

import { WEB_ENTRIES } from '../config';
import { injectedEntry } from '../versions/browser';
import type { RemoteModule, RemoteModuleId } from './modules';
import {
  normalizeShared,
  REACT_VERSION,
  type SharedModuleId,
} from './react-modules';
import { loadRemoteModuleOnServer } from './server';

/**
 * Next.js 16(Turbopack) host 의 Module Federation 진입점.
 *
 * 같은 `loadRemoteModule(id)` 호출이 실행 환경에 따라 두 경로로 갈린다.
 *
 *   브라우저 → @module-federation/runtime + remote 의 웹 번들(remoteEntry/manifest)
 *   서버     → ./server + remote 의 node 타깃 CJS 번들(mf-server.cjs)
 *
 * 덕분에 remote 가 **SSR 된다**. 초기 HTML 에 remote UI 가 그대로 들어간다.
 * host 에는 여전히 번들러 플러그인이 없다 — Turbopack 은 MF 를 몰라도 된다.
 *
 * 넘기는 React 모듈의 이름 목록과 정규화 프로브는 `./react-modules` 한 곳에 있다.
 * 서버 경로도 같은 표를 본다 — 네임스페이스만 각자 자기 그래프에서 import 한다
 * (`react-dom/client` 는 RSC 그래프에 들어갈 수 없다. 근거는 그 파일 머리말).
 */

/**
 * 브라우저가 remote 에 넘기는 모듈 실체. **여기는 다섯 개 전부** — `react-dom/client`
 * 까지 포함한다(catalog 의 Vite 플러그인이 매니페스트에 올린다).
 *
 * `satisfies` 가 표의 키를 하나라도 빠뜨리는 걸 막는다.
 */
const MODULES = normalizeShared({
  react: React,
  'react-dom': ReactDOM,
  'react-dom/client': ReactDOMClient,
  'react/jsx-runtime': ReactJSXRuntime,
  'react/jsx-dev-runtime': ReactJSXDevRuntime,
} satisfies Record<SharedModuleId, unknown>);

/**
 * 브라우저 MF `shared` 목록. **모듈 하나에 다른 건 없다** — 여기는 위 표에 공통 설정을
 * 입히는 자리다.
 *
 * `version` · `scope` · `shareConfig` 는 다섯 항목이 전부 같은 값이었고, 손으로 다섯 번
 * 반복하면 하나만 다르게 적혀도 그 모듈만 조용히 싱글턴에서 빠진다 — 증상은 훅이
 * 깨지는 것이고 원인은 설정 한 글자다.
 */
const SHARED = Object.fromEntries(
  Object.entries(MODULES).map(([id, mod]) => [
    id,
    {
      version: REACT_VERSION,
      scope: 'default',
      lib: () => mod,
      shareConfig: { singleton: true, requiredVersion: '^19.0.0' },
    },
  ]),
);

let initialized = false;

/**
 * 서버가 이 HTML 을 만들 때 쓴 remote 엔트리를 그대로 쓴다.
 * (`RemoteVersionSync` 가 인라인 스크립트로 심고, `versions/browser.ts` 가 읽는다)
 *
 * 목적은 **서버 마크업과 hydrate 하는 코드를 같은 빌드로 맞추는 것**이다.
 * 캐시된 HTML 이 오래 살아 있을수록 이 창이 벌어지고, 어긋나면 hydration 이 깨진다.
 *
 * remote 가 웹 자산을 `/v<version>/` 불변 경로로 배포하므로, 이 URL 이 나중에
 * 다른 코드를 가리키게 되는 일은 없다.
 *
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
): Promise<RemoteModule<K>> {
  ensureInit();
  const cached = clientCache.get(id);
  if (cached) return cached as Promise<RemoteModule<K>>;

  const promise = federationLoadRemote(id).then((mod) => {
    if (!mod) throw new Error(`remote 모듈 '${id}' 이(가) 비어 있습니다`);
    return mod as RemoteModule<K>;
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
): Promise<RemoteModule<K>> {
  if (typeof window === 'undefined') return loadRemoteModuleOnServer(id);
  return loadOnClient(id);
}
