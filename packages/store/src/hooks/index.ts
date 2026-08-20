/**
 * 도메인에 묶이지 않는 훅.
 *
 * `cart/` 같은 도메인 폴더가 "무슨 상태인가"를 담는다면, 여기는 **"React · 브라우저와
 * 어떻게 맞물리는가"** 를 담는다. 도메인이 늘어도 이 폴더는 그대로다.
 */
export { useHydrated } from './use-hydrated';
export { useRevalidateOnFocus } from './use-revalidate-on-focus';
