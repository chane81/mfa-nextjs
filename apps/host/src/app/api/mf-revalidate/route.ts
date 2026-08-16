import { revalidatePath, revalidateTag } from 'next/cache';

import { REMOTE_NAMES, type RemoteName } from '@mfa/contracts';

import { checkMfSecret, mfSecretHeader } from '@/lib/mf-secret';
import {
  fetchRemoteVersion,
  isBundleReady,
  knownVersion,
  readyVersion,
  remoteVersionTag,
  warmEpoch,
} from '@/mf/remote-version';
import { remoteBundleTag, remoteCacheTag } from '@/mf/server-loader';

/**
 * remote 배포 파이프라인이 host 캐시를 깨우는 엔드포인트.
 *
 * MFA 에서 캐시를 쓸 때 새로 만들어야 하는 유일한 배관이다. 모노레포는 한 번 빌드하면
 * 캐시 키가 같이 바뀌지만, remote 를 따로 배포하면 host 는 바뀐 사실을 알 방법이 없다.
 * remote CI 마지막 스텝이 이걸 호출한다:
 *
 *   curl -XPOST "$HOST_URL/api/mf-revalidate" \
 *     -H "x-mf-secret: $MF_REVALIDATE_SECRET" \
 *     -H 'content-type: application/json' \
 *     -d '{"remote":"catalog"}'
 *
 * ## 순서가 중요하다 — warm-then-revalidate
 *
 * 무효화를 먼저 하면, 재생성 렌더가 remote 번들을 네트워크로 받는 동안 Suspense fallback
 * 상태로 캐시에 굳을 수 있다(스켈레톤이 HIT 로 계속 서빙됨). 그래서 세 단계를 지킨다.
 *
 *   1. 버전 재조회 — 매니페스트·번들 fetch 를 즉시 만료시키고 remote 생존을 확인한다
 *   2. warm     — `/internal/mf-warm` 을 자기 자신에게 요청해 **SSR 레이어**를 데운다.
 *                 실패하면 여기서 멈춘다. 옛 캐시를 계속 서빙하는 편이 스켈레톤보다 낫다.
 *                 그 라우트도 같은 시크릿을 요구하므로 헤더를 그대로 전달한다.
 *   4. 무효화   — 그제서야 페이지 캐시를 깬다. 재생성 렌더는 네트워크를 기다리지 않는다.
 */
export async function POST(req: Request) {
  if (!checkMfSecret(req.headers)) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as { remote?: string };
  const remote = body.remote as RemoteName | undefined;
  if (!remote || !REMOTE_NAMES.includes(remote)) {
    return Response.json(
      { error: `remote 는 ${REMOTE_NAMES.join(' | ')} 중 하나여야 합니다` },
      { status: 400 },
    );
  }

  const url = new URL(req.url);
  const skipWarm = url.searchParams.get('warm') === '0';
  /**
   * 캐시 스코프 없이 통째로 프리렌더된 정적 라우트(`/` 등)는 `cacheTag` 가 없어서
   * 태그로 깰 수 없다. 그런 라우트까지 깨야 하면 `?paths=1`.
   */
  const alsoPaths = url.searchParams.get('paths') === '1';

  /**
   * 1. 버전 조회와 번들 계층만 무효화 — 페이지 캐시는 아직 건드리지 않는다.
   *
   * 버전 매니페스트를 먼저 깨야 한다. 그래야 warm 이 **새 버전**을 발견하고
   * 새 불변 경로에서 번들을 받는다. 이걸 빼면 warm 이 옛 버전을 데운다.
   *
   * 둘 다 **즉시 만료**(`{ expire: 0 }`)여야 한다. `"max"` 는 stale-while-revalidate 라
   * 다음 fetch 가 옛 값을 그대로 돌려준다. 그러면 warm 이 옛 remote 코드를 데우고,
   * remote 가 죽어 있어도 옛 바이트로 "성공"해버려 장애를 못 잡는다.
   *
   * 이 단계는 **최적화**다. 웹훅을 못 받은 인스턴스도 30초 TTL 이 지나면
   * `mf-version.json` 을 다시 읽어 같은 상태로 수렴한다. 웹훅은 그걸 앞당길 뿐이다.
   */
  revalidateTag(remoteVersionTag(remote), { expire: 0 });
  revalidateTag(remoteBundleTag(remote), { expire: 0 });

  const abort = (detail: string) =>
    // 무효화하지 않고 중단한다. 옛 캐시가 스켈레톤보다 낫다.
    Response.json(
      {
        error: 'warm 실패 — 페이지 캐시를 건드리지 않고 중단했습니다',
        detail,
        remote,
        version: knownVersion(remote)?.version ?? null,
        ready: readyVersion(remote),
      },
      { status: 502 },
    );

  /**
   * 2. remote 생존 확인 겸 새 버전 확인.
   *
   * 여기서 실제로 remote 에 도달한다. 이게 실패하면 remote 가 죽었거나 배포가 덜 된 것이므로
   * 더 진행하지 않는다. 아래 warm 은 캐시 히트로 끝날 수도 있어서(같은 버전 재배포)
   * "remote 에 닿았는지"를 증명하지 못한다 — 그 역할은 이 단계가 맡는다.
   */
  const published = skipWarm
    ? knownVersion(remote)
    : await fetchRemoteVersion(remote);
  if (!skipWarm && !published) {
    return abort(`remote '${remote}' 의 버전 매니페스트를 읽지 못했습니다`);
  }

  // 3. warm — SSR 레이어가 그 버전의 번들을 갖게 만든다
  let warmed: string | null = null;
  if (!skipWarm && published) {
    // nonce 로 lazy 캐시를 우회해 로더를 반드시 태운다 (롤백 대응)
    const warmUrl = new URL(
      `/internal/mf-warm?remote=${remote}&version=${published.version}&nonce=${published.version}-${Date.now()}`,
      url.origin,
    );
    try {
      const res = await fetch(warmUrl, {
        cache: 'no-store',
        headers: mfSecretHeader(),
      });
      await res.text();
      if (!res.ok) throw new Error(`warm 응답 ${res.status}`);
    } catch (error) {
      return abort(error instanceof Error ? error.message : String(error));
    }

    /**
     * 성공 판정은 **HTTP 상태가 아니라 적재된 버전**으로 한다.
     * warm 페이지의 remote 는 `RemoteBoundary` 안이라 remote 가 죽어도 200 이 나온다.
     *
     * 로드 횟수 증가로 판정하면 안 된다 — 같은 버전이면 캐시 히트라 로드가 아예 안 일어나고,
     * 정상인데도 실패로 오판한다(실측에서 502 오탐으로 드러났다).
     */
    if (!isBundleReady(remote, published.version, warmEpoch())) {
      return abort(
        `warm 이 이 버전을 적재하지 못했습니다 (공표=${published.version}, 적재=${readyVersion(remote) ?? '없음'}). ` +
          `무결성·서명 검증에서 거부됐을 수 있습니다 — 서버 로그를 확인하세요.`,
      );
    }
    warmed = 'ok';
  }

  // 4. 페이지 캐시 무효화 — 여기서부터 재생성 렌더는 데워진 번들을 쓴다
  revalidateTag(remoteCacheTag(remote), 'max');

  const paths = alsoPaths
    ? ['/', '/lab/isr', '/lab/cache', '/products/[id]']
    : [];
  for (const path of paths) revalidatePath(path, 'page');

  return Response.json({
    ok: true,
    remote,
    version: knownVersion(remote)?.version ?? null,
    warmed: warmed ?? 'skipped',
    tag: remoteCacheTag(remote),
    revalidated: paths,
  });
}
