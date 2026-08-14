import * as React from "react";
import * as ReactJSXDevRuntime from "react/jsx-dev-runtime";
import * as ReactJSXRuntime from "react/jsx-runtime";
import * as ReactDOM from "react-dom";

import type { RemoteModuleId, RemoteModuleMap, RemoteName } from "@mfa/contracts";

import { normalizeModule } from "./interop";
import { recordEval, recordFetch } from "./loader-stats";

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

/** remote 배포 파이프라인이 host 캐시를 깨울 때 쓰는 태그 이름 */
export function remoteCacheTag(remote: RemoteName): string {
  return `mf-remote:${remote}`;
}

/**
 * remote 번들을 받을 때 쓰는 fetch 옵션.
 *
 * dev 는 remote watch 빌드가 계속 번들을 갱신하므로 항상 새로 받는다.
 * 프로덕션은 Next 의 Data Cache 에 올려 요청마다 다시 받지 않게 한다.
 *
 * ⚠️ 여기 붙는 `next.tags` 는 **Data Cache 계층에만** 붙는다.
 * 페이지의 `"use cache"` 엔트리는 이 태그로 깨지지 않는다 — 그건 캐시 스코프 안에서
 * `cacheTag()` 로 직접 달아야 한다. 무효화가 세 층이라 세 층 다 건드려야 한다:
 *   1. 이 fetch 응답 (revalidateTag → 아래 태그)
 *   2. 평가 완료된 expose 맵 (invalidateServerBundle)
 *   3. 페이지 캐시 (revalidateTag → 페이지가 cacheTag 로 단 같은 이름)
 * 실측: docs/04-experiments/03-cache-modes.md
 */
function bundleFetchInit(remote: RemoteName): RequestInit {
  if (process.env.NODE_ENV !== "production") return { cache: "no-store" };
  return {
    cache: "force-cache",
    next: { tags: [remoteCacheTag(remote)] },
  } as RequestInit;
}

async function loadServerBundle(remote: RemoteName): Promise<ExposeMap> {
  const url = SSR_ENTRIES[remote];
  recordFetch(remote);
  const res = await fetch(url, bundleFetchInit(remote));
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
  recordEval();
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

/**
 * 평가까지 끝난 번들 캐시를 버린다.
 *
 * `revalidateTag()` 는 Next 의 Data Cache(=fetch 응답)만 건드린다.
 * 이 Map 은 `new Function` 평가 결과라 Next 가 모른다. remote 재배포 시
 * 둘 다 비워야 옛 remote 코드가 프로세스에 남지 않는다.
 *
 * 한계: 프로세스 로컬이다. host 를 여러 인스턴스로 띄우면 전 인스턴스에 브로드캐스트해야 한다.
 */
export function invalidateServerBundle(remote?: RemoteName): void {
  if (remote) bundleCache.delete(remote);
  else bundleCache.clear();
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
