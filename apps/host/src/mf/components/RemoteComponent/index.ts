export * from './RemoteComponent';
// `MfWarmup` 이 같은 키 규칙을 쓴다 — 캐시가 둘인데 규칙이 둘이 되면 한쪽만 무효화된다
export { remoteCacheKey } from './module-cache';
