/**
 * remote 서버 번들 로더 계측기.
 *
 * ## 왜 globalThis 인가
 * Next 는 RSC 레이어(`react-server` 조건)와 SSR 레이어의 모듈 인스턴스를 **분리**한다.
 * 모듈 스코프 변수에 카운터를 두면 페이지 SSR 이 올린 값과 Route Handler 가 읽는 값이
 * 서로 다른 인스턴스라 항상 0 으로 보인다. globalThis 는 프로세스 하나를 공유한다.
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
   * warm 이 실제로 성공했는지 판정하는 데 쓴다. HTTP 응답 코드로는 판정할 수 없다.
   * warm 페이지는 `RemoteBoundary` 로 감싸여 있어 remote 가 죽어도 200 을 돌려주기 때문이다.
   */
  loads: Record<string, number>;
}

const KEY = "__mfaLoaderStats";

type Holder = typeof globalThis & { [KEY]?: LoaderStats };

const empty = (): LoaderStats => ({ fetches: 0, evals: 0, byRemote: {}, loads: {} });

function holder(): LoaderStats {
  const g = globalThis as Holder;
  g[KEY] ??= empty();
  return g[KEY];
}

export function recordFetch(remote: string): void {
  const stats = holder();
  stats.fetches += 1;
  stats.byRemote[remote] = (stats.byRemote[remote] ?? 0) + 1;
}

export function recordEval(): void {
  holder().evals += 1;
}

/** expose 맵까지 확보된 시점에만 호출한다 */
export function recordLoad(remote: string): void {
  const stats = holder();
  stats.loads[remote] = (stats.loads[remote] ?? 0) + 1;
}

/** remote 가 지금까지 몇 번 성공적으로 로드됐는지 (warm 성공 판정용) */
export function loadCount(remote: string): number {
  return holder().loads[remote] ?? 0;
}

export function getLoaderStats(): LoaderStats {
  const stats = holder();
  return { ...stats, byRemote: { ...stats.byRemote }, loads: { ...stats.loads } };
}

export function resetLoaderStats(): void {
  const g = globalThis as Holder;
  g[KEY] = empty();
}
