import { SiteHeader } from '@/components/SiteHeader';
import { readCartLines } from '@/lib/cart-cookie';

/**
 * 헤더의 서버 쪽 껍데기. **쿠키를 읽는 것만** 한다.
 *
 * `SiteHeader` 는 `usePathname()` 때문에 client component 라 쿠키를 읽을 수 없다.
 * 그렇다고 레이아웃 본문에서 읽으면 `<Suspense>` 밖이 되어 **모든 라우트**가
 * 프리렌더에서 빠진다 — 캐시 실험(`/lab`)까지 같이 죽는다.
 *
 * 그래서 레이아웃의 기존 `<Suspense>` **안쪽**에 서버 컴포넌트를 하나 둔다.
 * 셸은 그대로 프리렌더되고, 쿠키를 읽는 부분만 요청 시 렌더된다.
 * 헤더는 원래도 그 경계 뒤로 스트리밍됐으므로 새로 생기는 지연이 없다.
 */
export async function SiteHeaderSlot() {
  const initialLines = await readCartLines();

  return <SiteHeader initialLines={initialLines} />;
}
