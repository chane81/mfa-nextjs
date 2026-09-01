import { revalidateTag } from 'next/cache';

import { REMOTE_NAMES, type RemoteName } from '@mfa/contracts';

import { getLoaderStats, resetLoaderStats } from '@/mf/state/loader-stats';
import {
  announcedVersions,
  fetchRemoteVersion,
  remoteVersionTag,
} from '@/mf/versions/server';
import { ssrEntrySnapshot } from '@/mf/loader/server';

/**
 * 조회로 버전이 바뀌었으면 그 remote 의 캐시 태그를 즉시 만료시킨다.
 *
 * ## 왜 조회만으로는 부족한가
 *
 * `fetchRemoteVersion` 은 `globalCell` 을 새 버전으로 갱신한다. 그런데 브라우저에
 * 버전을 심는 `RemoteVersionSync` 는 `"use cache"` 라 **옛 버전을 담은 스크립트를
 * 계속 낸다.** 그 상태로 페이지가 새로 렌더되면 서버가 만든 `<link>` 는 새 버전,
 * 심어준 값은 옛 버전이라 하이드레이션 때 스타일시트를 한 번 더 요청한다
 * (옛 버전 자산이 정리됐으면 404 — known-issues G-1 과 같은 얼굴이다).
 *
 * 재배포 웹훅(`/api/mf-revalidate`)은 이미 같은 태그를 깬다. 이 실험용 조회만
 * 갱신과 무효화가 갈라져 있었다.
 *
 * `{ expire: 0 }` 은 Server Action 밖에서 즉시 만료시키는 형태다
 * (Next 16.3 `revalidateTag(tag, profile)` — 웹훅 라우트와 같은 호출).
 */
function expireChangedTags(
  before: Partial<Record<RemoteName, string>>,
  after: Partial<Record<RemoteName, string>>,
): void {
  for (const remote of REMOTE_NAMES) {
    if (before[remote] !== after[remote])
      revalidateTag(remoteVersionTag(remote), { expire: 0 });
  }
}

/**
 * 로더 계측과 이 인스턴스가 보고 있는 remote 버전을 읽는다.
 *
 * 실험 절차(리셋이 필요하므로 `pnpm dev` 에서 돌린다 — 아래 `DELETE` 주석 참고):
 *   1. `DELETE /api/lab/stats` 로 0 으로 리셋
 *   2. 대상 페이지를 N 번 요청
 *   3. `GET /api/lab/stats` 로 fetch/eval 횟수 확인
 *
 * 캐시가 동작하면 HIT 구간의 요청은 fetch 도 eval 도 0 이어야 한다.
 *
 * `versions` 는 멀티 인스턴스 수렴을 확인하는 데 쓴다. 웹훅을 받지 않은 인스턴스도
 * TTL 이 지나면 같은 버전으로 따라와야 한다. `?refresh=1` 은 그 조회를 지금 강제한다.
 */
export async function GET(req: Request) {
  const refresh = new URL(req.url).searchParams.get('refresh') === '1';
  if (refresh) {
    const before = announcedVersions();
    await Promise.all(REMOTE_NAMES.map((remote) => fetchRemoteVersion(remote)));
    expireChangedTags(before, announcedVersions());
  }

  return Response.json({
    at: new Date().toISOString(),
    versions: announcedVersions(),
    entries: ssrEntrySnapshot(),
    stats: getLoaderStats(),
  });
}

/**
 * 계측 리셋. 인증 없이 서버 상태를 바꾸므로 **프로덕션에는 없다.**
 *
 * `proxy.ts` 가 이미 렌더 앞에서 404 를 낸다. 여기서 다시 보는 건 matcher 가
 * 틀어져도 뚫리지 않게 하기 위한 것이다 — `/internal/*` 과 같은 이중 방어다.
 */
export function DELETE() {
  if (process.env.NODE_ENV === 'production')
    return new Response('not found', { status: 404 });

  resetLoaderStats();
  return Response.json({ ok: true, stats: getLoaderStats() });
}
