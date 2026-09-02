/**
 * 장바구니 한 줄.
 *
 * **런타임 상태도 저장 포맷도 `@mfa/store` 가 쥐지만, 이 타입만 여기 있다.**
 * `remote-cart` 의 세 모듈이 `initialLines` 로 이 모양을 받고 host 가 그걸 넘긴다 —
 * **셋이 같이 쓰는 어휘**라 원본이 contracts 쪽이다.
 *
 * 그 props 선언 자체는 여기 없다. remote 의 expose 파일 옆에 있고 host 는 DTS 로
 * 받아간다(`apps/remote-cart/src/exposes/CartPanel.tsx`). 어휘와 표면은 다른 것이다 —
 * 표면을 여기 두면 host 와 remote 가 같은 선언을 가리켜 DTS 가 전달할 게 없어진다.
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
