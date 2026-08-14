import { revalidatePath, revalidateTag } from "next/cache";

import { REMOTE_NAMES, type RemoteName } from "@mfa/contracts";

import { loadCount } from "@/mf/loader-stats";
import { bumpRemoteGeneration, remoteBundleTag, remoteCacheTag } from "@/mf/server-loader";

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
 *   1. 세대 bump — 모든 레이어의 번들 캐시가 다음 접근에서 스스로 무효화된다
 *   2. warm     — `/internal/mf-warm` 을 자기 자신에게 요청해 **SSR 레이어**를 데운다.
 *                 실패하면 여기서 멈춘다. 옛 캐시를 계속 서빙하는 편이 스켈레톤보다 낫다.
 *   3. 무효화   — 그제서야 페이지 캐시를 깬다. 재생성 렌더는 네트워크를 기다리지 않는다.
 */
export async function POST(req: Request) {
  const secret = process.env.MF_REVALIDATE_SECRET;
  if (!secret || req.headers.get("x-mf-secret") !== secret) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as { remote?: string };
  const remote = body.remote as RemoteName | undefined;
  if (!remote || !REMOTE_NAMES.includes(remote)) {
    return Response.json(
      { error: `remote 는 ${REMOTE_NAMES.join(" | ")} 중 하나여야 합니다` },
      { status: 400 },
    );
  }

  const url = new URL(req.url);
  const skipWarm = url.searchParams.get("warm") === "0";
  /**
   * 캐시 스코프 없이 통째로 프리렌더된 정적 라우트(`/` 등)는 `cacheTag` 가 없어서
   * 태그로 깰 수 없다. 그런 라우트까지 깨야 하면 `?paths=1`.
   */
  const alsoPaths = url.searchParams.get("paths") === "1";

  /**
   * 1. 번들 계층만 무효화 — 페이지 캐시는 아직 건드리지 않는다.
   *
   * 여기는 **즉시 만료**(`{ expire: 0 }`)여야 한다. `"max"` 는 stale-while-revalidate 라
   * 다음 fetch 가 옛 번들 바이트를 그대로 돌려준다. 그러면 warm 이 **옛 remote 코드**를
   * 데우고, 그 상태로 페이지를 재생성해 옛 UI 가 캐시에 굳는다.
   * remote 가 죽어 있는 경우도 옛 바이트로 "성공"해버려 warm 이 장애를 못 잡는다.
   */
  const generation = bumpRemoteGeneration(remote);
  revalidateTag(remoteBundleTag(remote), { expire: 0 });

  // 2. warm — SSR 레이어에서 새 번들을 실제로 평가시킨다
  let warmed: string | null = null;
  if (!skipWarm) {
    const warmUrl = new URL(`/internal/mf-warm?remote=${remote}`, url.origin);
    /**
     * 성공 판정은 **HTTP 상태가 아니라 로더 계측**으로 한다.
     * warm 페이지의 remote 는 `RemoteBoundary` 로 감싸여 있어서 remote 가 죽어도 200 이 나온다.
     * 계측 카운터는 globalThis 에 있어 SSR 레이어가 올린 값을 여기서 읽을 수 있다.
     */
    const before = loadCount(remote);
    try {
      const res = await fetch(warmUrl, { cache: "no-store" });
      await res.text();
      if (!res.ok) throw new Error(`warm 응답 ${res.status}`);
      if (loadCount(remote) <= before) {
        throw new Error(`warm 요청은 200 이지만 remote '${remote}' 번들이 로드되지 않았습니다`);
      }
      warmed = "ok";
    } catch (error) {
      // 무효화하지 않고 중단한다. 옛 캐시가 스켈레톤보다 낫다.
      return Response.json(
        {
          error: "warm 실패 — 페이지 캐시를 건드리지 않고 중단했습니다",
          detail: error instanceof Error ? error.message : String(error),
          remote,
          generation,
        },
        { status: 502 },
      );
    }
  }

  // 3. 페이지 캐시 무효화 — 여기서부터 재생성 렌더는 데워진 번들을 쓴다
  revalidateTag(remoteCacheTag(remote), "max");

  const paths = alsoPaths ? ["/", "/lab/isr", "/lab/cache", "/products/[id]"] : [];
  for (const path of paths) revalidatePath(path, "page");

  return Response.json({
    ok: true,
    remote,
    generation,
    warmed: warmed ?? "skipped",
    tag: remoteCacheTag(remote),
    revalidated: paths,
  });
}
