/**
 * `@mfa/store` 의 cart 도메인이 내보내는 것 — **훅 하나, 순수 함수 하나, 타입.**
 *
 * 스토어 인스턴스(`cartStore`)와 팩토리는 내보내지 않는다. 인스턴스를 공개하면
 * "어디서든 `getState()` 로 건드릴 수 있는 전역"이 하나 더 생긴다.
 * 무엇을 구독할지는 `useCart(selector)` 로 호출부가 정한다.
 */
export { useCart } from './create-store';
export * from './totals';

export type { CartLine, CartState } from './create-store';
