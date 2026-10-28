/**
 * 도메인에 묶이지 않는 내부 장치.
 *
 * **진입점이 없다** — `@mfa/store` 밖으로 나가지 않는다(ADR-013). 새 도메인이 같은
 * 장치를 재사용하는 자리다: `globalSingleton('auth', createAuthStore)`,
 * `createCookieStorage({ read, write })`.
 */
export { globalSingleton } from './global-singleton';
export {
  createCookieStorage,
  readCookie,
  type CookieAttributes,
  type CookieStorageOptions,
} from './cookie-storage';
