import { headers } from 'next/headers';
import { notFound } from 'next/navigation';

import { REMOTE_NAMES, type RemoteName } from '@mfa/contracts';

import { MfWarmup } from '@/components/lab/MfWarmup';
import { checkMfSecret } from '@/lib/mf-secret';
import { bumpWarmEpoch } from '@/mf/state/warm';

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
  searchParams: Promise<{ remote?: string; nonce?: string }>;
}) {
  if (!checkMfSecret(await headers())) notFound();

  const { remote, nonce } = await searchParams;
  const remotes: RemoteName[] =
    remote && (REMOTE_NAMES as readonly string[]).includes(remote)
      ? [remote as RemoteName]
      : [...REMOTE_NAMES];

  /**
   * 캐시를 무효화하고 시작한다.
   *
   * warm 은 "이 배포를 실제로 적재할 수 있는가"를 증명하는 절차라, 이미 갖고 있는 걸
   * 재사용하면 증명이 되지 않는다. 같은 버전으로 바이트만 바뀐 경우(변조·깨진 배포)도
   * 여기서 걸린다.
   */
  bumpWarmEpoch();

  /**
   * 버전은 여기서 다시 정하지 않는다.
   *
   * 한때 `version` 쿼리로 받은 값을 globalThis 에 덮어썼는데, 그 재구성본에는
   * 무결성 값이 빠져 있어서 두 번째 웹훅부터 로드가 거부됐다.
   * 지금은 로더가 이미 아는 버전을 그대로 쓰므로(재조회하지 않으므로) 그럴 필요가 없다.
   * 버전을 정하는 곳은 웹훅과 레이아웃 두 군데뿐이다.
   */

  return (
    <>
      <MfWarmup remotes={remotes} nonce={nonce ?? 'warm'} />
      <p data-testid="warm-done" className="text-xs">
        warmed: {remotes.join(', ')}
      </p>
    </>
  );
}
