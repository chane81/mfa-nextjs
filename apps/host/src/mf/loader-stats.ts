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
  /** remote 별 fetch 횟수 */
  byRemote: Record<string, number>;
}

const KEY = "__mfaLoaderStats";

type Holder = typeof globalThis & { [KEY]?: LoaderStats };

function holder(): LoaderStats {
  const g = globalThis as Holder;
  g[KEY] ??= { fetches: 0, evals: 0, byRemote: {} };
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

export function getLoaderStats(): LoaderStats {
  const stats = holder();
  return { ...stats, byRemote: { ...stats.byRemote } };
}

export function resetLoaderStats(): void {
  const g = globalThis as Holder;
  g[KEY] = { fetches: 0, evals: 0, byRemote: {} };
}
