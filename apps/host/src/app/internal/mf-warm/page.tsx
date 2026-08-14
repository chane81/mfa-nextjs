import { headers } from "next/headers";
import { notFound } from "next/navigation";

import { REMOTE_NAMES, type RemoteName } from "@mfa/contracts";

import { MfWarmup } from "@/components/lab/MfWarmup";
import { checkMfSecret } from "@/lib/mf-secret";
import { rememberVersion } from "@/mf/remote-version";

/**
 * warm 전용 라우트. 사람이 볼 화면이 아니라 `/api/mf-revalidate` 가 내부에서 호출한다.
 *
 * 하는 일: remote 를 SSR 레이어에서 한 번 렌더해 번들 캐시를 채운다.
 * 그 뒤에 페이지 캐시를 무효화하면 재생성 렌더가 네트워크를 기다리지 않는다.
 *
 * ## 인증
 * `/api/mf-revalidate` 와 **같은 시크릿**을 요구한다. 이 라우트는 요청 하나로 host 가
 * remote 번들을 받아 실행하게 만들 수 있으므로 열어두면 안 된다.
 * 실패는 401 이 아니라 `notFound()` — 라우트 존재 자체를 알릴 이유가 없다.
 *
 * ## 왜 `instant = false` 인가
 * 인증을 Suspense 안(스트리밍 구간)에서 하면 **정적 셸이 200 으로 먼저 나간 뒤**
 * `notFound()` 가 실행돼 상태 코드를 못 바꾼다. 실측에서 미인증 요청이 200 으로 나왔다.
 *
 * `instant = false` 는 "이 세그먼트는 블로킹해도 된다"는 Cache Components 의 명시적
 * 이스케이프 해치다. 셸을 먼저 흘리지 않으므로 응답 헤더 전에 404 를 낼 수 있다.
 * 즉시 렌더가 가치인 사용자 화면이 아니라 내부 훅이므로 이쪽이 맞다.
 */
export const instant = false;

export default async function MfWarmPage({
  searchParams,
}: {
  searchParams: Promise<{ remote?: string; nonce?: string; version?: string }>;
}) {
  if (!checkMfSecret(await headers())) notFound();

  const { remote, nonce, version } = await searchParams;
  const remotes: RemoteName[] =
    remote && (REMOTE_NAMES as readonly string[]).includes(remote)
      ? [remote as RemoteName]
      : [...REMOTE_NAMES];

  /**
   * 웹훅이 정한 버전을 그대로 고정한다.
   *
   * 여기서 버전을 다시 조회하면 Data Cache 의 옛 응답을 집어 방금 정한 버전을 덮어쓸 수 있다.
   * warm 의 목적은 "이 버전을 적재하는 것"이지 "지금 버전이 뭔지 알아내는 것"이 아니다.
   */
  const single = remotes.length === 1 ? remotes[0] : undefined;
  if (single && version) {
    rememberVersion(single, {
      version,
      ssrEntry: `/v${version}/mf-server.cjs`,
      webEntry: `/v${version}/mf-manifest.json`,
    });
  }

  return (
    <>
      <MfWarmup remotes={remotes} nonce={nonce ?? "warm"} />
      <p data-testid="warm-done" style={{ fontSize: 12 }}>
        warmed: {remotes.join(", ")}
      </p>
    </>
  );
}
