import { CheckoutSection } from './_src/components/CheckoutSection';
import { readCartLines } from '@/libs/cart-cookie';

/**
 * 장바구니를 `<Suspense>` 밖에서 읽는 라우트 — 프리렌더 검증에서 빠진다.
 * 전문은 `[[cart-cookie]]` 의 "부르는 자리가 캐시를 결정한다" 와 ADR-014.
 *
 * 값을 리터럴로 적는다. 라우트 세그먼트 설정은 정적 분석 대상이라 다른 모듈에서
 * `export { instant } from ...` 로 공유할 수 없다 — 이 세 줄이 복제의 한계다.
 */
export const instant = false;

/**
 * remote 를 SSR 하므로 요청 시점에 remote 번들을 가져와야 한다.
 * 정적 프리렌더로 굳히면 remote 를 재배포해도 host 가 옛 마크업을 계속 내보낸다.
 *
 * 주문서는 값이 틀리면 안 되는 화면이라 장바구니가 첫 HTML 부터 맞아야 한다.
 *
 * **쿠키를 여기서 직접 읽는다.** `[[CartSlot]]` 은 `/` 와 `/cart` 둘이 써서 껍데기가
 * 필요하고 `[[SiteHeaderSlot]]` 은 layout 의 `<Suspense>` 안쪽이어야 하지만, 이
 * 라우트는 소비자가 자기 하나다 — 껍데기를 두면 "읽어서 넘긴다" 두 줄을 위해 파일이
 * 하나 더 생길 뿐이다. 둘째 라우트가 생기면 그때 `CheckoutSlot` 으로 올린다.
 */
export default async function CheckoutPage() {
  const initialLines = await readCartLines();

  return <CheckoutSection initialLines={initialLines} />;
}
