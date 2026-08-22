/**
 * 장바구니 한 줄.
 *
 * **런타임 상태도 저장 포맷도 `@mfa/store` 가 쥐지만, 이 타입만 여기 있다.**
 * `CartPanelProps` · `CartBadgeProps` · `CheckoutFlowProps` 의 `initialLines` 가 이 모양이고
 * `remote-cart` 가 그걸 props 로 받는다 — **host ↔ remote 계약에 나타나는 타입**이라
 * 원본이 contracts 쪽이다.
 *
 * 쿠키 코덱(`parseCartCookie` 등)은 여기 없다. 그건 host(서버)와 `@mfa/store`(브라우저)
 * 사이의 규칙이고 remote 는 부르지 않는다 — `@mfa/store` 의 `cart/cookie-codec` 에 있다.
 * 근거: ADR-015
 */
export interface CartLine {
  readonly productId: string;
  readonly name: string;
  readonly emoji: string;
  readonly unitPrice: number;
  readonly quantity: number;
}
