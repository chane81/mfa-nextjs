import * as React from "react";
import * as ReactJSXDevRuntime from "react/jsx-dev-runtime";
import * as ReactJSXRuntime from "react/jsx-runtime";
import * as ReactDOM from "react-dom";

import type { RemoteModuleId, RemoteModuleMap, RemoteName } from "@mfa/contracts";

import { normalizeModule } from "./interop";

/**
 * remote 를 **서버에서** 로드하는 로더.
 *
 * ## 왜 직접 만들었나
 * `@module-federation/node` 는 peer 로 webpack 을 요구한다. host 는 Turbopack 이라 webpack 이 없다.
 * 그래서 필요한 최소 동작만 직접 구현한다:
 *   1. remote 가 배포한 node 타깃 CJS 번들을 HTTP 로 가져온다
 *   2. host 의 React 를 require 셰임으로 주입하며 평가한다
 *   3. expose 키 → 컴포넌트 맵을 돌려준다
 *
 * ## 왜 node builtin 을 안 쓰나
 * 이 모듈은 client component 트리에서 import 되므로 브라우저 번들에도 포함된다.
 * `node:vm` / `node:fs` 를 쓰면 Turbopack 이 브라우저 번들에서 터진다.
 * `fetch` + `new Function` 만 쓰면 한 파일로 양쪽 번들을 통과한다(서버에서만 호출됨).
 *
 * ## 신뢰 경계
 * host 서버가 remote 의 코드를 실행한다. 브라우저에서 remote 청크를 실행하는 것과
 * 같은 신뢰 수준이지만 영향 범위가 서버 프로세스라는 점은 다르다.
 * 운영에서는 remote origin 을 허용 목록으로 고정하고 무결성 검증(SRI 등)을 붙일 것.
 */

const SSR_ENTRIES: Record<RemoteName, string> = {
  catalog: process.env.REMOTE_CATALOG_SSR_ENTRY ?? "http://localhost:3001/mf-server.cjs",
  cart: process.env.REMOTE_CART_SSR_ENTRY ?? "http://localhost:3002/mf-server.cjs",
};

/**
 * remote 서버 번들이 external 로 남긴 모듈 — host 인스턴스를 넘긴다.
 *
 * 브라우저 쪽 MF shared 와 달리 여기서는 서브엔트리도 직접 넘겨야 한다.
 * remote 의 node 번들이 `require("react/jsx-runtime")` 를 그대로 호출하기 때문이다.
 * 네임스페이스 모양이 `{ default: {...} }` 로 올 수 있어 프로브로 정규화한다.
 */
const INJECTED: Record<string, unknown> = {
  react: normalizeModule(React, "useState"),
  "react-dom": normalizeModule(ReactDOM, "createPortal"),
  "react/jsx-runtime": normalizeModule(ReactJSXRuntime, "jsx"),
  "react/jsx-dev-runtime": normalizeModule(ReactJSXDevRuntime, "jsxDEV"),
};

type ExposeMap = Record<string, unknown>;

const bundleCache = new Map<RemoteName, Promise<ExposeMap>>();

async function loadServerBundle(remote: RemoteName): Promise<ExposeMap> {
  const url = SSR_ENTRIES[remote];
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`remote '${remote}' SSR 번들 응답 ${res.status} (${url})`);
  }
  const code = await res.text();

  const requireShim = (id: string): unknown => {
    const injected = INJECTED[id];
    if (injected) return injected;
    throw new Error(
      `remote '${remote}' 서버 번들이 예상 밖 모듈을 require 했습니다: '${id}'. ` +
        `번들러 externals 설정을 확인하세요.`,
    );
  };

  const moduleObj: { exports: ExposeMap } = { exports: {} };
  // remote 번들은 CommonJS 다. host 의 React 를 주입하며 평가한다.
  const factory = new Function("module", "exports", "require", code) as (
    m: typeof moduleObj,
    e: ExposeMap,
    r: (id: string) => unknown,
  ) => void;
  factory(moduleObj, moduleObj.exports, requireShim);

  const raw = moduleObj.exports;
  // 번들러에 따라 `module.exports.default` 또는 `module.exports` 자체가 맵이다
  const exposes = (raw.default ?? raw) as ExposeMap;
  if (!exposes || typeof exposes !== "object") {
    throw new Error(`remote '${remote}' SSR 번들이 expose 맵을 내보내지 않았습니다`);
  }
  return exposes;
}

function getServerBundle(remote: RemoteName): Promise<ExposeMap> {
  // dev 에서는 remote 의 watch 빌드가 계속 번들을 갱신하므로 캐시하지 않는다
  if (process.env.NODE_ENV !== "production") return loadServerBundle(remote);

  const cached = bundleCache.get(remote);
  if (cached) return cached;

  const promise = loadServerBundle(remote).catch((error: unknown) => {
    // 실패한 promise 를 캐시에 남기면 서버가 살아있는 동안 계속 실패한다
    bundleCache.delete(remote);
    throw error;
  });
  bundleCache.set(remote, promise);
  return promise;
}

/** 서버에서 remote 모듈 하나를 가져온다. 반환 형태는 브라우저 로더와 동일하다. */
export async function loadRemoteModuleOnServer<K extends RemoteModuleId>(
  id: K,
): Promise<RemoteModuleMap[K]> {
  const [remote, ...rest] = id.split("/");
  const exposeKey = `./${rest.join("/")}`;
  const exposes = await getServerBundle(remote as RemoteName);

  const Component = exposes[exposeKey];
  if (!Component) {
    throw new Error(
      `remote '${remote}' 에 '${exposeKey}' 가 없습니다. ` +
        `사용 가능: ${Object.keys(exposes).join(", ") || "(없음)"}`,
    );
  }
  return { default: Component } as RemoteModuleMap[K];
}

export const SSR_REMOTE_ENTRIES = SSR_ENTRIES;
