import { REMOTE_NAMES, type RemoteName } from '@mfa/contracts';
import { MF_FILES } from '@mfa/remote-config';

import { REMOTE_FETCH_TIMEOUT_MS } from './constants';
import { globalCell } from './global-state';
import { SSR_ENTRIES } from './remote-endpoints';
import {
  assertAllowedOrigin,
  assertManifestSignature,
  assertSafeEntryPath,
  assertSafeVersion,
  allowedOrigins,
  signedPayload,
} from './remote-trust';

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
  /** host 서버가 받아 실행하는 node 번들 (오리진 기준 상대 경로) */
  ssrEntry: string;
  /** 브라우저 MF 런타임이 읽는 매니페스트 (오리진 기준 상대 경로) */
  webEntry: string;
  /** SSR 번들의 SRI 값. 평가 전에 대조한다. */
  ssrIntegrity?: string;
}

/** 허용 오리진. 기본값은 설정된 remote 오리진들뿐이라 이미 닫혀 있다. */
export function trustedOrigins(): string[] {
  return allowedOrigins(
    REMOTE_NAMES.map((remote) => new URL(SSR_ENTRIES[remote]).origin),
  );
}

/**
 * 마지막으로 확인된 **공표된** 버전 — remote 가 `mf-version.json` 에서 뭐라고 말했는지.
 *
 * 조회하는 쪽(RSC 레이아웃)과 그걸로 캐시 키를 만드는 쪽(SSR 레이어)이 서로 다른
 * 모듈 그래프라 레이어를 넘는 저장소여야 한다. 근거는 `[[global-state]]`.
 */
const known = globalCell(
  'remote-versions',
  () => ({}) as Partial<Record<RemoteName, RemoteVersion>>,
);

export function knownVersion(remote: RemoteName): RemoteVersion | null {
  return known.value[remote] ?? null;
}

export function rememberVersion(remote: RemoteName, info: RemoteVersion): void {
  known.value[remote] = info;
}

/**
 * "이 프로세스가 지금 어느 버전의 번들을 실제로 들고 있는가."
 *
 * `knownVersion` 은 **공표된** 버전(remote 가 뭐라고 말하는지),
 * 이건 **적재된** 버전(우리가 실제로 평가해 둔 게 뭔지)이다. 둘은 다를 수 있고,
 * warm 이 성공했는지는 정확히 "둘이 같아졌는가"로 판정한다.
 *
 * 적재는 SSR 레이어에서 일어나고 판정은 RSC 레이어(Route Handler)에서 한다 — 방향만
 * 반대일 뿐 위와 같은 이유로 레이어를 넘는다.
 */
interface ReadyState {
  version: string;
  /** 적재된 시점의 warm 세대. "언제 적재했는지"까지 봐야 warm 이 증명이 된다. */
  epoch: number;
}

const ready = globalCell(
  'ready-versions',
  () => ({}) as Partial<Record<RemoteName, ReadyState>>,
);

export function markBundleReady(
  remote: RemoteName,
  version: string,
  epoch: number,
): void {
  ready.value[remote] = { version, epoch };
}

export function readyVersion(remote: RemoteName): string | null {
  return ready.value[remote]?.version ?? null;
}

/**
 * "이번 warm 에서 이 버전을 실제로 적재했는가."
 *
 * 버전만 비교하면 예전에 같은 버전을 적재해 둔 상태를 성공으로 오인한다.
 * 실제로 번들이 변조된 배포가 그 구멍으로 통과했다(무결성 검사는 막았는데 웹훅은 200).
 */
export function isBundleReady(
  remote: RemoteName,
  version: string,
  epoch: number,
): boolean {
  const state = ready.value[remote];
  return state?.version === version && state.epoch === epoch;
}

/**
 * warm 세대. 올리면 다음 접근에서 번들을 **다시 받아 다시 검증**한다.
 *
 * 버전만으로 캐시를 키잉하면 "같은 버전인데 바이트가 바뀐" 경우를 못 잡는다.
 * 정상 배포에서는 버전이 늘 바뀌므로 그런 상황은 변조이거나 깨진 파이프라인이고,
 * warm 은 그걸 잡아내야 의미가 있다. 그래서 warm 은 캐시를 믿지 않는다.
 */
const epoch = globalCell('warm-epoch', () => 0);

export function warmEpoch(): number {
  return epoch.value;
}

export function bumpWarmEpoch(): number {
  return (epoch.value += 1);
}

export function knownVersions(): Partial<Record<RemoteName, string>> {
  const out: Partial<Record<RemoteName, string>> = {};
  for (const [remote, info] of Object.entries(known.value)) {
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
export async function fetchRemoteVersion(
  remote: RemoteName,
): Promise<RemoteVersion | null> {
  const url = `${remoteOrigin(remote)}/${MF_FILES.versionManifest}`;
  // 번들과 같은 제한을 건다 — 매니페스트가 매달리면 그 뒤 전부가 매달린다
  const signal = AbortSignal.timeout(REMOTE_FETCH_TIMEOUT_MS);
  const init: RequestInit =
    process.env.NODE_ENV === 'production'
      ? ({
          next: { revalidate: 30, tags: [remoteVersionTag(remote)] },
          signal,
        } as RequestInit)
      : { cache: 'no-store', signal };

  type Manifest = Partial<RemoteVersion> & {
    signature?: string;
    webIntegrity?: string;
  };

  // 네트워크 실패는 조용히 넘긴다 — remote 가 잠깐 안 뜬 것과 거부는 다른 사건이다
  const body = await (async (): Promise<Manifest | null> => {
    try {
      assertAllowedOrigin(remote, url, trustedOrigins());
      const res = await fetch(url, init);
      if (!res.ok) return null;
      return (await res.json()) as Manifest;
    } catch {
      return null;
    }
  })();

  if (!body?.version || !body.ssrEntry || !body.webEntry) return null;
  const { version, ssrEntry, webEntry, ssrIntegrity, webIntegrity, signature } =
    body;

  /**
   * 이 매니페스트는 **remote 가 주는 값**이다. 그대로 믿으면
   * "다른 오리진에서 받아 실행하라"는 지시를 그대로 따르게 된다.
   * 경로 형태를 먼저 좁히고, 서명이 있으면 출처까지 확인한다.
   *
   * 검증 실패는 조용히 넘기지 않는다. 폴백으로 흘러가면 막은 의미가 없다.
   */
  try {
    // 경로보다 먼저 버전을 좁힌다 — 경로 검사는 버전을 신뢰한 채로 도는 검사다
    assertSafeVersion(remote, version);
    assertSafeEntryPath(remote, ssrEntry, version);
    assertSafeEntryPath(remote, webEntry, version);
    await assertManifestSignature(
      remote,
      signedPayload({
        remote,
        version,
        ssrEntry,
        webEntry,
        ssrIntegrity,
        webIntegrity,
      }),
      signature,
    );
  } catch (error) {
    console.error(`[mf] remote '${remote}' 버전 매니페스트 거부:`, error);
    return null;
  }

  const info: RemoteVersion = { version, ssrEntry, webEntry, ssrIntegrity };
  rememberVersion(remote, info);
  return info;
}
