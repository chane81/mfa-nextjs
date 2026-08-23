import { CartSlot } from '@/components/CartSlot';

/**
 * 장바구니를 `<Suspense>` 밖에서 읽는 라우트 — 프리렌더 검증에서 빠진다.
 * 전문은 `[[cart-cookie]]` 의 "부르는 자리가 캐시를 결정한다" 와 ADR-014.
 *
 * 값을 리터럴로 적는다. 라우트 세그먼트 설정은 정적 분석 대상이라 다른 모듈에서
 * `export { instant } from ...` 로 공유할 수 없다 — 이 세 줄이 복제의 한계다.
 */
export const instant = false;

/**
 * 장바구니가 본문인 화면. 쿠키를 읽는 일은 `CartSlot` 이 한다 —
 * 페이지에는 위의 라우트 정책만 남는다.
 */
export default function CartPage() {
  return <CartSlot />;
}
