import { CartSection } from '@/components/CartSection';
import { readCartLines } from '@/lib/cart-cookie';

/**
 * 장바구니의 서버 쪽 껍데기. **쿠키를 읽는 것만** 한다. `[[SiteHeaderSlot]]` 과 같은 꼴이다.
 *
 * `CartSection` 은 `useRouter()` 때문에 client component 라 쿠키를 못 읽는다. 그렇다고
 * 라우트마다 읽으면 `/` 와 `/cart` 두 페이지가 같은 세 줄(쿠키 읽기 → props 로 넘기기)을
 * 복붙하게 된다 — 장바구니를 어디서 읽는지가 라우트 수만큼 흩어진다.
 *
 * 여기로 모으면 페이지에는 **라우트 정책만** 남는다(`instant = false`). 저장 매체가
 * 쿠키에서 다른 것으로 바뀌어도 고칠 자리는 이 파일과 `SiteHeaderSlot` 둘뿐이다.
 *
 * ⚠️ 이 컴포넌트는 `<Suspense>` **밖**에서 렌더돼야 한다. 그래야 장바구니가 첫 HTML 에
 * 들어간다 — 그 대가로 그 라우트는 프리렌더되지 않는다. 부르는 페이지가
 * `export const instant = false` 를 같이 둬야 하는 이유고, 근거는 ADR-014 다.
 */
export async function CartSlot({ compact = false }: { compact?: boolean }) {
  const initialLines = await readCartLines();

  return <CartSection compact={compact} initialLines={initialLines} />;
}
