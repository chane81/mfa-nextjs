/**
 * `@mfa/store` 의 cart 도메인이 내보내는 것 — **훅 · 순수 함수 · 타입.**
 *
 * 스토어 인스턴스(`cartStore`)와 팩토리는 내보내지 않는다. 인스턴스를 공개하면
 * "어디서든 `getState()` 로 건드릴 수 있는 전역"이 하나 더 생긴다.
 * 무엇을 구독할지는 `useCart(selector)` 로 호출부가 정한다.
 *
 * 훅과 순수 함수(`totals` · `cookie-codec`)가 같이 있다. 이 배럴은 `'use client'` 모듈을
 * 재수출하므로 **서버(RSC) 코드가 여기를 타면 안 된다** — 서버에서 평가되진 않지만
 * 클라이언트 참조로 브라우저 번들에 실린다(실측 zustand + 스토어 21.8KB).
 *
 * 그래서 서버용 표면은 `src/server.ts` 가 따로 모으고, `package.json` 의 `react-server`
 * 조건이 RSC 그래프를 그쪽으로 보낸다. 소비처의 import 문(`@mfa/store`)은 그대로다.
 * 근거: ADR-015
 */
export { useCart } from './create-store';
export * from './totals';

export type { CartLine, CartState } from './create-store';
export * from './cookie-codec';
