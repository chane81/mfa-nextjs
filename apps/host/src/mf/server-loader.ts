import * as React from "react";
import * as ReactJSXDevRuntime from "react/jsx-dev-runtime";
import * as ReactJSXRuntime from "react/jsx-runtime";
import * as ReactDOM from "react-dom";

import { REMOTE_NAMES, type RemoteModuleId, type RemoteModuleMap, type RemoteName } from "@mfa/contracts";

import { normalizeModule } from "./interop";
import { recordEval, recordFetch, recordLoad } from "./loader-stats";
import {
  fallbackSsrEntry,
  fetchRemoteVersion,
  knownVersion,
  markBundleReady,
  remoteOrigin,
} from "./remote-version";

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

interface CacheEntry {
  /** 이 엔트리를 만든 remote 버전. 버전이 바뀌면 버린다. */
  version: string;
  exposes: Promise<ExposeMap>;
}

const bundleCache = new Map<RemoteName, CacheEntry>();

/** 버전을 모를 때 쓰는 캐시 키 (dev, 또는 stamp 안 한 remote) */
const UNVERSIONED = "unversioned";

/**
 * remote 하나에 태그가 **두 개**인 이유.
 *
 * warm-then-revalidate 는 순서가 전부다. 번들 fetch 계층을 먼저 깨서 새 코드를 받고,
 * 그게 성공한 뒤에야 페이지 캐시를 깬다. 태그가 하나면 이 순서를 못 만든다 —
 * 번들을 깨는 순간 페이지도 같이 깨져서 재생성이 warm 보다 먼저 일어날 수 있다.
 */

/** ① remote 번들 fetch 응답(Data Cache)용 */
export function remoteBundleTag(remote: RemoteName): string {
  return `mf-remote-bundle:${remote}`;
}

/** ② remote 를 렌더하는 페이지의 `"use cache"` 스코프용 */
export function remoteCacheTag(remote: RemoteName): string {
  return `mf-remote:${remote}`;
}

/**
 * ## 캐시는 레이어별로, 무효화 신호는 globalThis 로
 *
 * `bundleCache` 는 **레이어마다 별도 인스턴스**여야 한다. Next 는 RSC 레이어와
 * SSR 레이어의 모듈 그래프를 분리하고, 각 레이어의 `import * as React` 가 서로 다른
 * React 빌드로 해석된다. 평가된 remote 번들에는 그 레이어의 React 가 주입되어 있으므로
 * 레이어 간에 공유하면 `useState` 가 깨진다.
 *
 * 그런데 무효화 신호는 반대로 **모든 레이어에 닿아야 한다**. Route Handler(RSC 레이어)에서
 * remote 재배포를 통보받아도 페이지를 실제로 렌더하는 SSR 레이어의 Map 은 그대로이기 때문이다.
 *
 * 그래서 캐시는 레이어별로 두고, **버전 문자열만 globalThis 로 공유한다**
 * (`remote-version.ts`). 버전이 바뀌면 각 레이어가 다음 접근에서 스스로 캐시를 버린다.
 *
 * 프로세스 안 카운터가 아니라 remote 가 공표한 버전을 쓰는 이유는 멀티 인스턴스다.
 * 카운터는 웹훅이 닿은 인스턴스에만 오르지만, 버전은 모든 인스턴스가 같은 출처에서 읽는다.
 */

/**
 * remote 번들을 받을 때 쓰는 fetch 옵션.
 *
 * dev 는 remote watch 빌드가 계속 번들을 갱신하므로 항상 새로 받는다.
 * 프로덕션은 Next 의 Data Cache 에 올려 요청마다 다시 받지 않게 한다.
 *
 * ⚠️ 여기 붙는 `next.tags` 는 **Data Cache 계층에만** 붙는다.
 * 페이지의 `"use cache"` 엔트리는 이 태그로 깨지지 않는다 — 그건 캐시 스코프 안에서
 * `cacheTag()` 로 직접 달아야 한다. 무효화 대상이 네 층이다:
 *   1. 버전 매니페스트    → revalidateTag(remoteVersionTag)
 *   2. 이 fetch 응답      → revalidateTag(remoteBundleTag)
 *   3. 평가된 expose 맵    → 버전이 바뀌면 자동
 *   4. 페이지 캐시        → revalidateTag(remoteCacheTag)
 * 실측: docs/04-experiments/03-cache-modes.md
 */
function bundleFetchInit(remote: RemoteName): RequestInit {
  if (process.env.NODE_ENV !== "production") return { cache: "no-store" };
  return {
    cache: "force-cache",
    next: { tags: [remoteBundleTag(remote)] },
  } as RequestInit;
}

/**
 * 이번에 받을 SSR 번들 URL 과 그 버전.
 *
 * 버전을 알면 불변 경로(`/v<hash>/mf-server.cjs`)를 쓴다. 같은 URL 이 다른 코드를
 * 가리키지 않으므로 캐시된 HTML 이 어떤 remote 로 만들어졌는지가 확정된다.
 * 모르면 버전 없는 엔트리로 폴백한다 — dev 이거나 stamp 를 안 돌린 remote 다.
 */
async function resolveEntry(remote: RemoteName): Promise<{ url: string; version: string }> {
  /**
   * 이미 아는 버전이 있으면 **재조회하지 않는다.**
   *
   * 버전 갱신은 레이아웃(`RemoteVersionSync`)과 재배포 웹훅의 책임이다. 여기서 또 조회하면
   * warm 도중 Data Cache 의 옛 응답을 집어 방금 정한 버전을 덮어쓰는 경쟁이 생긴다.
   * (실측: 롤포워드 웹훅이 "공표=새 버전, 적재=옛 버전"으로 실패했다)
   *
   * 아무것도 모르는 콜드 상태에서만 직접 읽는다.
   */
  const info = knownVersion(remote) ?? (await fetchRemoteVersion(remote));
  if (!info) return { url: fallbackSsrEntry(remote), version: UNVERSIONED };
  return { url: `${remoteOrigin(remote)}${info.ssrEntry}`, version: info.version };
}

async function loadServerBundle(remote: RemoteName, url: string): Promise<ExposeMap> {
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
  recordLoad(remote);
  return exposes;
}

async function getServerBundle(remote: RemoteName): Promise<ExposeMap> {
  const { url, version } = await resolveEntry(remote);

  // dev 에서는 remote 의 watch 빌드가 계속 번들을 갱신하므로 캐시하지 않는다
  if (process.env.NODE_ENV !== "production") return loadServerBundle(remote, url);

  const cached = bundleCache.get(remote);
  if (cached && cached.version === version) return cached.exposes;

  const exposes = loadServerBundle(remote, url)
    .then((loaded) => {
      // "이 버전을 실제로 들고 있다"를 전역에 알린다 — warm 성공 판정의 근거
      markBundleReady(remote, version);
      return loaded;
    })
    .catch((error: unknown) => {
      // 실패한 promise 를 캐시에 남기면 서버가 살아있는 동안 계속 실패한다
      if (bundleCache.get(remote)?.exposes === exposes) bundleCache.delete(remote);
      throw error;
    });
  bundleCache.set(remote, { version, exposes });
  return exposes;
}

/**
 * remote 번들을 미리 받아 평가해둔다 (warm).
 *
 * **이 함수를 호출한 레이어의 캐시만** 데워진다. 그게 요점이다 —
 * 페이지 캐시를 무효화하기 **전에** SSR 레이어를 데워두면, 재생성 렌더가
 * 네트워크를 기다리지 않고 즉시 remote 마크업을 만들어낸다.
 *
 * warm 없이 무효화하면 재생성 렌더가 remote 를 기다리다 Suspense fallback 상태로
 * 캐시에 굳을 수 있다(실측 기록: docs/04-experiments/03-cache-modes.md 발견 6).
 */
export async function warmServerBundle(remote: RemoteName): Promise<number> {
  const exposes = await getServerBundle(remote);
  return Object.keys(exposes).length;
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

/** 진단용 — 지금 이 인스턴스가 어느 엔트리를 보고 있는지 */
export function ssrEntrySnapshot(): Record<RemoteName, string> {
  return REMOTE_NAMES.reduce(
    (acc, remote) => {
      const info = knownVersion(remote);
      acc[remote] = info ? `${remoteOrigin(remote)}${info.ssrEntry}` : fallbackSsrEntry(remote);
      return acc;
    },
    {} as Record<RemoteName, string>,
  );
}
