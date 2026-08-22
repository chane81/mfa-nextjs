'use client';

import { useHydrated } from '../hooks';

import { useCart, type CartLine } from './create-store';
import { useCartSync } from './use-cart-sync';

/**
 * 화면에 그릴 장바구니 줄. **화면이 부를 훅은 이거 하나다.**
 *
 * ## 무엇을 감추나
 *
 * 장바구니를 그리는 자리는 전부 같은 세 가지를 해야 했다 — 탭 동기화를 걸고
 * (`useCartSync`), 하이드레이션 경계를 재고(`useHydrated`), 경계 전후로 값을 갈라
 * 쓰는 것(`initialLines` ↔ 스토어). remote 세 곳이 그 네 줄을 그대로 복붙하고 있었다.
 *
 * 그 셋은 **화면의 관심사가 아니라 이 패키지의 규칙**이다. remote 는 "host 가 서버에서
 * 읽은 값이 하이드레이션 커밋 전까지만 유효하다" 같은 사정을 알 이유가 없다.
 * 규칙이 여기 한 곳에만 있으면 경계가 바뀔 때 고칠 자리도 한 곳이다.
 *
 * ## 왜 커밋 전에는 스토어를 못 쓰나
 *
 * zustand 의 `useStore` 는 하이드레이션 렌더에서 서버 스냅샷(`getInitialState()` =
 * 빈 장바구니)을 쓴다 — 서버 HTML 과 첫 클라이언트 렌더가 달라지면 안 되기 때문이다.
 * 그래서 그 한 렌더까지는 **서버가 쿠키에서 읽어 넘긴 `initialLines`** 를 쓴다.
 * 두 값은 같은 쿠키에서 나오므로 커밋 순간에 화면이 바뀌지 않는다 — 전이 자체가 없다.
 * 근거는 `[[use-hydrated]]` 와 ADR-014.
 *
 * 단일 탭 기준이다. 응답 전송과 하이드레이션 사이에 다른 탭이 쿠키를 바꾸면 그 한 번은
 * 갈리고, 포커스가 돌아올 때 `[[use-cart-sync]]` 가 수렴시킨다.
 *
 * ```ts
 * const lines = useCartLines(initialLines);
 * const { totalPriceLabel } = cartTotals(lines);
 * ```
 *
 * @param initialLines host 가 요청 쿠키에서 읽어 props 로 넘긴 값. 서버가 장바구니를
 *   모르는 자리(예: 순수 클라이언트 화면)에서는 비워도 된다 — 커밋 전 한 렌더만
 *   빈 장바구니로 그려진다.
 */
export function useCartLines(
  initialLines?: readonly CartLine[],
): readonly CartLine[] {
  /** 다른 탭이 장바구니를 바꿨으면 이 탭이 앞으로 나올 때 다시 읽는다 */
  useCartSync();

  const hydrated = useHydrated();
  const storeLines = useCart((state) => state.lines);

  return hydrated ? storeLines : (initialLines ?? []);
}
