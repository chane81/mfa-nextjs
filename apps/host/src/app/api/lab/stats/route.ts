import { REMOTE_NAMES } from '@mfa/contracts';

import { getLoaderStats, resetLoaderStats } from '@/mf/loader-stats';
import { fetchRemoteVersion, knownVersions } from '@/mf/remote-version';
import { ssrEntrySnapshot } from '@/mf/server-loader';

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
  if (refresh)
    await Promise.all(REMOTE_NAMES.map((remote) => fetchRemoteVersion(remote)));

  return Response.json({
    at: new Date().toISOString(),
    versions: knownVersions(),
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
