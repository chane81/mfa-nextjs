import type { RemoteName } from '@mfa/contracts';

import { globalCell } from './global-state';

/**
 * warm 상태 — "이 프로세스가 지금 무엇을 들고 있고, 언제 들었는가."
 *
 * ## 왜 버전과 한 파일이 아닌가
 *
 * `mf/versions/` 는 **버전이 무엇인지**(remote 가 공표한 값 · 서버가 심어준 값)를 다룬다.
 * 여기는 **그 버전으로 뭘 했는지**다 — 번들을 실제로 적재했는가, 그게 이번 warm 이었는가.
 * 축이 달라서 한 파일에 두면 "버전 파일에 warm 세대가 왜 있지" 가 된다.
 *
 * 둘 다 `globalCell` 을 쓰는 건 같은 이유다 — RSC 레이어와 SSR 레이어가 모듈 그래프를
 * 달리해서, 한쪽이 쓰고 다른 쪽이 읽는 값은 모듈 스코프에 둘 수 없다(`[[global-state]]`).
 */

/**
 * "이 프로세스가 지금 어느 버전의 번들을 실제로 들고 있는가."
 *
 * `announcedVersion`(`versions/server.ts`)은 **공표된** 버전(remote 가 뭐라고 말하는지),
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
