import { CheckoutSlot } from '@/components/CheckoutSlot';

/**
 * 이 라우트는 **요청을 기다렸다 렌더한다.**
 *
 * `cacheComponents` 는 모든 페이지가 비어 있지 않은 정적 셸을 만들어내는지 검증하는데,
 * 장바구니 쿠키를 `<Suspense>` 밖에서 읽는 순간 그 검증에 걸린다(빌드 에러
 * `blocking-prerender-dynamic`). `instant = false` 가 그 검증에서 빼주는 공식 통로다.
 *
 * Suspense 로 감싸는 쪽도 가능하지만 그러면 장바구니가 스트리밍으로 나중에 도착해
 * **없애려던 전이가 그대로 돌아온다.** 셸을 잃는 대신 첫 HTML 을 맞추는 쪽을 고른다.
 * 문서 지침대로 루트 레이아웃이 아니라 이 페이지에만 건다 — 위에 걸면 `/lab` 의
 * 캐시 실험까지 검증에서 빠진다. 근거: ADR-014
 *
 * 리터럴로 적는다. 라우트 세그먼트 설정은 정적 분석 대상이라 다른 모듈에서
 * `export { instant } from ...` 로 공유할 수 없다.
 */
export const instant = false;

/**
 * remote 를 SSR 하므로 요청 시점에 remote 번들을 가져와야 한다.
 * 정적 프리렌더로 굳히면 remote 를 재배포해도 host 가 옛 마크업을 계속 내보낸다.
 *
 * 주문서는 값이 틀리면 안 되는 화면이라 장바구니가 첫 HTML 부터 맞아야 한다.
 * 쿠키를 읽는 일은 `CheckoutSlot` 이 한다.
 */
export default function CheckoutPage() {
  return <CheckoutSlot />;
}
