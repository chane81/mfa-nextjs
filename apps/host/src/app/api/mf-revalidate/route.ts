import { revalidatePath, revalidateTag } from "next/cache";

import { REMOTE_NAMES, type RemoteName } from "@mfa/contracts";

import { invalidateServerBundle, remoteCacheTag } from "@/mf/server-loader";

/**
 * remote 배포 파이프라인이 host 캐시를 깨우는 엔드포인트.
 *
 * MFA 에서 ISR 을 쓸 때 유일하게 새로 만들어야 하는 배관이다.
 * 모노레포는 한 번 빌드하면 캐시 키가 같이 바뀌지만, remote 를 따로 배포하면
 * host 는 remote 가 바뀐 사실을 알 방법이 없다. 그래서 remote CI 마지막 스텝이 이걸 호출한다:
 *
 *   curl -XPOST "$HOST_URL/api/mf-revalidate" \
 *     -H "x-mf-secret: $MF_REVALIDATE_SECRET" \
 *     -H 'content-type: application/json' \
 *     -d '{"remote":"catalog"}'
 *
 * 세 층을 전부 비워야 한다:
 *   1. Data Cache  — remote 번들 fetch 응답 (revalidateTag)
 *   2. 프로세스 캐시 — 평가 완료된 expose 맵 (invalidateServerBundle)
 *   3. Full Route Cache — remote 마크업이 박힌 HTML (revalidatePath)
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

  invalidateServerBundle(remote);
  // Next 16 부터 revalidateTag 는 두 번째 인자(cacheLife 프로필)가 필수다.
  // "max" = 최대 만료. remote 가 실제로 바뀐 시점이므로 즉시 무효화가 맞다.
  revalidateTag(remoteCacheTag(remote), "max");

  /**
   * cacheComponents 브랜치에서는 **경로를 나열하지 않는다.**
   *
   * remote 번들 fetch 에 붙인 태그가 그 fetch 를 감싼 `"use cache"` 엔트리로 전파되는지
   * 검증하기 위해서다. 전파된다면 host 는 "어느 라우트가 이 remote 를 쓰는지" 알 필요가 없다.
   * `?paths=1` 로 요청하면 기존 경로 무효화도 같이 돈다(대조군).
   */
  const alsoPaths = new URL(req.url).searchParams.get("paths") === "1";
  const paths = alsoPaths ? ["/", "/lab/isr", "/lab/cache", "/products/[id]"] : [];
  for (const path of paths) revalidatePath(path, "page");

  return Response.json({ ok: true, remote, tag: remoteCacheTag(remote), revalidated: paths });
}
