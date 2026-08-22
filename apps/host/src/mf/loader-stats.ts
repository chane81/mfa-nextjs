import { globalCell } from './global-state';

/**
 * remote 서버 번들 로더 계측기.
 *
 * ## 왜 레이어를 넘는 저장소인가
 * 카운터를 올리는 쪽은 페이지 SSR(SSR 레이어)이고 읽는 쪽은 Route Handler(RSC 레이어)다.
 * 모듈 스코프 변수에 두면 서로 다른 인스턴스라 읽는 쪽에서 항상 0 으로 보인다.
 * 근거와 공유 방식은 `[[global-state]]`.
 *
 * ## 왜 시간(Date)을 안 담나
 * 이 카운터는 remote 렌더 도중에 호출된다. cacheComponents 를 켜면 prerender 중
 * `Date.now()` 는 동적 IO 로 취급돼 캐시 경계를 깨뜨릴 수 있다. 순수 카운터만 둔다.
 * 시각이 필요하면 읽는 쪽(Route Handler)이 자기 시각을 찍는다.
 */

export interface LoaderStats {
  /** remote 번들을 HTTP 로 실제로 받아온 횟수 */
  fetches: number;
  /** `new Function` 으로 번들을 평가한 횟수 */
  evals: number;
  /** remote 별 fetch **시도** 횟수 (실패 포함) */
  byRemote: Record<string, number>;
  /**
   * remote 별 **성공** 횟수 — expose 맵까지 확보된 것만 센다.
   *
   * HTTP 응답 코드로는 이걸 알 수 없다. remote 를 렌더하는 페이지는 `RemoteBoundary` 로
   * 감싸여 있어 remote 가 죽어도 200 을 돌려주기 때문이다.
   */
  loads: Record<string, number>;
}

const empty = (): LoaderStats => ({
  fetches: 0,
  evals: 0,
  byRemote: {},
  loads: {},
});

const stats = globalCell('loader-stats', empty);

export function recordFetch(remote: string): void {
  stats.value.fetches += 1;
  stats.value.byRemote[remote] = (stats.value.byRemote[remote] ?? 0) + 1;
}

export function recordEval(): void {
  stats.value.evals += 1;
}

/** expose 맵까지 확보된 시점에만 호출한다 */
export function recordLoad(remote: string): void {
  stats.value.loads[remote] = (stats.value.loads[remote] ?? 0) + 1;
}

/** 읽는 쪽이 내부 객체를 들고 가지 않게 얕게 복사해서 준다 */
export function getLoaderStats(): LoaderStats {
  const held = stats.value;
  return {
    ...held,
    byRemote: { ...held.byRemote },
    loads: { ...held.loads },
  };
}

export function resetLoaderStats(): void {
  stats.value = empty();
}
