/**
 * `globalCell`(host) 과 `globalSingleton`(store) 은 `Symbol.for` 레지스트리를 쓴다.
 * realm 전역이라 **`vi.resetModules()` 로는 안 지워진다** — 테스트가 서로의 셀을 물려받아
 * "혼자 돌리면 통과하는데 같이 돌리면 실패한다" 는 형태로 나타난다.
 *
 * ⚠️ 레지스트리를 비우면 **이미 import 된 모듈이 붙잡고 있는 셀 참조는 그대로다.**
 * (`loader-stats.ts` 의 `stats` 처럼 모듈 스코프에 캐시하는 경우가 있다.)
 * 그래서 이 함수는 보통 `vi.resetModules()` + 동적 `import()` 와 짝으로 쓴다.
 */
const REGISTRY_KEYS = [
  '@mfa/host/mf-global-state',
  '@mfa/store/singletons',
] as const;

export function clearGlobalRegistries(): void {
  for (const key of REGISTRY_KEYS) {
    delete (globalThis as Record<symbol, unknown>)[Symbol.for(key)];
  }
}
