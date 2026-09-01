import { type RemoteName } from '@mfa/contracts';
import { MF_FILES } from '@mfa/remote-config';

import { REMOTE_FETCH_TIMEOUT_MS, ssrOrigin } from '../config';
import { globalCell } from '../state/cell';
import {
  assertAllowedOrigin,
  assertManifestSignature,
  assertSafeEntryPath,
  assertSafeVersion,
  signedPayload,
  trustedOrigins,
} from '../trust';

/**
 * remote 버전 해석 — **host 서버 전용**.
 *
 * 이 파일의 값은 전부 host **서버 프로세스**에서만 유효하다. `globalCell` 은 그 프로세스의
 * globalThis 고, `fetchRemoteVersion` 은 신뢰 검증까지 하는 서버 경로다. 브라우저에서
 * 부르면 조용히 "버전 모름" 이 된다 — 그 오해가 24차의 CSS 404 였다(known-issues G-1).
 * 브라우저 쪽 값은 `./browser`, 둘을 합친 소비 창구는 `./index` 의 `remoteVersion` 이다.
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

export interface RemoteVersion {
  version: string;
  /** host 서버가 받아 실행하는 node 번들 (오리진 기준 상대 경로) */
  ssrEntry: string;
  /** 브라우저 MF 런타임이 읽는 매니페스트 (오리진 기준 상대 경로) */
  webEntry: string;
  /** SSR 번들의 SRI 값. 평가 전에 대조한다. */
  ssrIntegrity?: string;
}

/** remote 버전 조회 응답을 무효화할 때 쓰는 태그 */
export function remoteVersionTag(remote: RemoteName): string {
  return `mf-remote-version:${remote}`;
}

/**
 * remote 가 **공표한** 버전 — `mf-version.json` 에서 뭐라고 말했는지.
 *
 * 이름의 축은 **누가 준 값인가**다. 여기는 remote 가 공표(announce)한 것,
 * `./browser` 의 `injectedEntry` 는 서버가 HTML 에 심어(inject) 준 것.
 * 위치(server/browser)가 아니라 출처로 부르면 합치는 줄이 대칭이 된다.
 *
 * 조회하는 쪽(RSC 레이아웃)과 그걸로 캐시 키를 만드는 쪽(SSR 레이어)이 서로 다른
 * 모듈 그래프라 레이어를 넘는 저장소여야 한다. 근거는 `[[state/cell]]`.
 */
const known = globalCell(
  'remote-versions',
  () => ({}) as Partial<Record<RemoteName, RemoteVersion>>,
);

export function announcedVersion(remote: RemoteName): RemoteVersion | null {
  return known.value[remote] ?? null;
}

export function rememberVersion(remote: RemoteName, info: RemoteVersion): void {
  known.value[remote] = info;
}

export function announcedVersions(): Partial<Record<RemoteName, string>> {
  const out: Partial<Record<RemoteName, string>> = {};
  for (const [remote, info] of Object.entries(known.value)) {
    out[remote as RemoteName] = info.version;
  }
  return out;
}

/** 매니페스트는 remote 가 주는 값이다 — 필드가 다 있는지도 아직 모른다 */
type Manifest = Partial<RemoteVersion> & {
  signature?: string;
  webIntegrity?: string;
};

/**
 * 매니페스트를 받아온다. 네트워크 실패는 `null` — remote 가 잠깐 안 뜬 것과
 * **검증 거부**는 다른 사건이라, 거부는 부르는 쪽에서 따로 다룬다.
 */
async function fetchManifest(
  remote: RemoteName,
  url: string,
): Promise<Manifest | null> {
  // 번들과 같은 제한을 건다 — 매니페스트가 매달리면 그 뒤 전부가 매달린다
  const signal = AbortSignal.timeout(REMOTE_FETCH_TIMEOUT_MS);
  const init: RequestInit =
    process.env.NODE_ENV === 'production'
      ? ({
          next: { revalidate: 30, tags: [remoteVersionTag(remote)] },
          signal,
        } as RequestInit)
      : { cache: 'no-store', signal };

  try {
    assertAllowedOrigin(remote, url, trustedOrigins());
    const res = await fetch(url, init);
    if (!res.ok) return null;
    return (await res.json()) as Manifest;
  } catch {
    return null;
  }
}

/**
 * 매니페스트가 준 값을 믿어도 되는지 확인한다.
 *
 * 이건 **remote 가 주는 값**이다. 그대로 믿으면 "다른 오리진에서 받아 실행하라"는
 * 지시를 그대로 따르게 된다. 경로 형태를 먼저 좁히고, 서명이 있으면 출처까지 확인한다.
 *
 * 검증 실패는 조용히 넘기지 않는다. 폴백으로 흘러가면 막은 의미가 없다.
 */
async function assertTrusted(
  remote: RemoteName,
  version: string,
  ssrEntry: string,
  webEntry: string,
  rest: Pick<Manifest, 'ssrIntegrity' | 'webIntegrity' | 'signature'>,
): Promise<void> {
  const { ssrIntegrity, webIntegrity, signature } = rest;

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
  const url = `${ssrOrigin(remote)}/${MF_FILES.versionManifest}`;
  const body = await fetchManifest(remote, url);
  if (!body?.version || !body.ssrEntry || !body.webEntry) return null;
  const { version, ssrEntry, webEntry, ssrIntegrity } = body;

  try {
    await assertTrusted(remote, version, ssrEntry, webEntry, body);
  } catch (error) {
    console.error(`[mf] remote '${remote}' 버전 매니페스트 거부:`, error);
    return null;
  }

  const info: RemoteVersion = { version, ssrEntry, webEntry, ssrIntegrity };
  rememberVersion(remote, info);
  return info;
}
