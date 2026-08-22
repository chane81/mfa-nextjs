import { CheckoutSection } from '@/components/CheckoutSection';
import { readCartLines } from '@/lib/cart-cookie';

/**
 * 주문서의 서버 쪽 껍데기. **쿠키를 읽는 것만** 한다. 근거는 `[[CartSlot]]` 과 같다.
 *
 * 지금은 부르는 라우트가 `/checkout` 하나뿐이라 중복이 없지만, 자리를 맞춰 둔다 —
 * "쿠키를 읽는 서버 컴포넌트가 client 섹션을 감싼다"가 host 에서 장바구니를 다루는
 * 유일한 모양이어야 새 라우트가 늘 때 페이지가 다시 쿠키를 알게 되지 않는다.
 */
export async function CheckoutSlot() {
  const initialLines = await readCartLines();

  return <CheckoutSection initialLines={initialLines} />;
}
