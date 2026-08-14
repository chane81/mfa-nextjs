import { connection } from "next/server";
import { Suspense } from "react";

import { REMOTE_NAMES, type RemoteName } from "@mfa/contracts";

import { MfWarmup } from "@/components/lab/MfWarmup";

/**
 * warm 전용 라우트. 사람이 볼 화면이 아니라 `/api/mf-revalidate` 가 내부에서 호출한다.
 *
 * 하는 일: remote 를 SSR 레이어에서 한 번 렌더해 번들 캐시를 채운다.
 * 그 뒤에 페이지 캐시를 무효화하면, 재생성 렌더가 네트워크를 기다리지 않는다.
 *
 * 절대 캐시되면 안 되므로 `connection()` 으로 요청마다 렌더시킨다.
 */
async function Warm({ searchParams }: { searchParams: Promise<{ remote?: string }> }) {
  await connection();

  const { remote } = await searchParams;
  const remotes: RemoteName[] =
    remote && (REMOTE_NAMES as readonly string[]).includes(remote)
      ? [remote as RemoteName]
      : [...REMOTE_NAMES];

  return (
    <>
      <MfWarmup remotes={remotes} />
      <p data-testid="warm-done" style={{ fontSize: 12 }}>
        warmed: {remotes.join(", ")}
      </p>
    </>
  );
}

export default function MfWarmPage({
  searchParams,
}: {
  searchParams: Promise<{ remote?: string }>;
}) {
  return (
    <Suspense fallback={null}>
      <Warm searchParams={searchParams} />
    </Suspense>
  );
}
