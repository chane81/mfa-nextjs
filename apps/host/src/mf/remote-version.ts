import type { RemoteName } from "@mfa/contracts";

/**
 * remote 버전 해석.
 *
 * ## 왜 버전이 필요한가
 *
 * 1. **멀티 인스턴스 수렴.** 세대 카운터를 프로세스 안에 두면 재배포 웹훅이 닿은 인스턴스만
 *    갱신되고 나머지는 재시작 전까지 옛 remote 를 서빙한다. 브로드캐스트 대신 remote 가
 *    공표하는 `mf-version.json` 을 각 인스턴스가 읽게 하면, 신호가 아니라 **상태**로 수렴한다.
 *
 * 2. **불변 아티팩트.** 버전이 있으면 `/v<hash>/mf-server.cjs` 라는 고유 URL 이 생긴다.
 *    같은 URL 이 다른 코드를 가리키는 일이 없어져 롤백이 가능해지고,
 *    캐시된 HTML 이 어떤 remote 로 만들어졌는지 특정할 수 있다.
 *
 * 이 모듈은 client component 트리에서도 import 되므로 `next/*` 를 쓰지 않는다.
 */

const SSR_ENTRIES: Record<RemoteName, string> = {
  catalog: process.env.REMOTE_CATALOG_SSR_ENTRY ?? "http://localhost:3001/mf-server.cjs",
  cart: process.env.REMOTE_CART_SSR_ENTRY ?? "http://localhost:3002/mf-server.cjs",
};

/** remote 오리진. 버전 매니페스트와 버전 경로를 여기에 붙인다. */
export function remoteOrigin(remote: RemoteName): string {
  return new URL(SSR_ENTRIES[remote]).origin;
}

/** 버전 없는 폴백 엔트리 (dev, 또는 stamp 를 돌리지 않은 remote) */
export function fallbackSsrEntry(remote: RemoteName): string {
  return SSR_ENTRIES[remote];
}

/** remote 버전 조회 응답을 무효화할 때 쓰는 태그 */
export function remoteVersionTag(remote: RemoteName): string {
  return `mf-remote-version:${remote}`;
}

export interface RemoteVersion {
  version: string;
  /** 오리진 기준 상대 경로 */
  ssrEntry: string;
}

/**
 * 마지막으로 확인된 버전.
 *
 * globalThis 인 이유는 RSC 레이어와 SSR 레이어가 모듈 인스턴스를 공유하지 않기 때문이다.
 * 버전을 **조회**하는 쪽(RSC: 레이아웃)과 그걸로 캐시 키를 만드는 쪽(SSR: 클라이언트
 * 컴포넌트 렌더)이 서로 다른 레이어라 이 값만 전역으로 공유한다.
 */
const KEY = "__mfaRemoteVersions";

type Holder = typeof globalThis & { [KEY]?: Partial<Record<RemoteName, RemoteVersion>> };

function store(): Partial<Record<RemoteName, RemoteVersion>> {
  const g = globalThis as Holder;
  g[KEY] ??= {};
  return g[KEY];
}

export function knownVersion(remote: RemoteName): RemoteVersion | null {
  return store()[remote] ?? null;
}

export function rememberVersion(remote: RemoteName, info: RemoteVersion): void {
  store()[remote] = info;
}

/**
 * "이 프로세스가 지금 어느 버전의 번들을 실제로 들고 있는가."
 *
 * `knownVersion` 은 **공표된** 버전(remote 가 뭐라고 말하는지),
 * 이건 **적재된** 버전(우리가 실제로 평가해 둔 게 뭔지)이다. 둘은 다를 수 있고,
 * warm 이 성공했는지는 정확히 "둘이 같아졌는가"로 판정한다.
 *
 * 로드는 SSR 레이어에서 일어나고 판정은 RSC 레이어(Route Handler)에서 하므로 globalThis 다.
 */
const READY_KEY = "__mfaReadyVersions";

type ReadyHolder = typeof globalThis & { [READY_KEY]?: Partial<Record<RemoteName, string>> };

function ready(): Partial<Record<RemoteName, string>> {
  const g = globalThis as ReadyHolder;
  g[READY_KEY] ??= {};
  return g[READY_KEY];
}

export function markBundleReady(remote: RemoteName, version: string): void {
  ready()[remote] = version;
}

export function readyVersion(remote: RemoteName): string | null {
  return ready()[remote] ?? null;
}

export function knownVersions(): Partial<Record<RemoteName, string>> {
  const out: Partial<Record<RemoteName, string>> = {};
  for (const [remote, info] of Object.entries(store())) {
    out[remote as RemoteName] = info.version;
  }
  return out;
}

/**
 * remote 가 공표한 현재 버전을 읽는다.
 *
 * 프로덕션에서는 Data Cache 에 30초 TTL 로 올린다. 이 값이 곧 인스턴스 간 수렴 시간이다.
 * 재배포 웹훅을 받은 인스턴스는 태그를 즉시 만료시켜 기다리지 않는다.
 *
 * 매니페스트가 없으면 `null` — 호출자가 버전 없는 엔트리로 폴백한다.
 * remote 를 못 읽는 상황과 "아직 stamp 안 한 remote" 를 구분하지 않는다.
 * 둘 다 "버전을 모른다"이고, 그때 할 일은 같다.
 */
export async function fetchRemoteVersion(remote: RemoteName): Promise<RemoteVersion | null> {
  const url = `${remoteOrigin(remote)}/mf-version.json`;
  const init: RequestInit =
    process.env.NODE_ENV === "production"
      ? ({ next: { revalidate: 30, tags: [remoteVersionTag(remote)] } } as RequestInit)
      : { cache: "no-store" };

  try {
    const res = await fetch(url, init);
    if (!res.ok) return null;

    const body = (await res.json()) as Partial<RemoteVersion>;
    if (!body.version || !body.ssrEntry) return null;

    const info: RemoteVersion = { version: body.version, ssrEntry: body.ssrEntry };
    rememberVersion(remote, info);
    return info;
  } catch {
    return null;
  }
}
