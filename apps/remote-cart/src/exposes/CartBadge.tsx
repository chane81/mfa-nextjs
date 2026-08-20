import type { CSSProperties } from 'react';

import type { CartBadgeProps } from '@mfa/contracts';
import { cartTotals, useCart, useCartSync, useHydrated } from '@mfa/store';

/**
 * host 에 노출되는 모듈: `cart/CartBadge`
 * host 헤더에 박히는 아주 작은 remote — "조각 단위 소비" 실험용.
 */
export default function CartBadge({
  label = '장바구니',
  initialLines,
}: CartBadgeProps) {
  /** 다른 탭이 장바구니를 바꿨으면 이 탭이 앞으로 나올 때 다시 읽는다 */
  useCartSync();

  const hydrated = useHydrated();
  const storeLines = useCart((state) => state.lines);

  /**
   * 하이드레이션 커밋 전에는 host 가 쿠키에서 읽어 넘긴 값을 쓴다. 스토어의 서버
   * 스냅샷은 빈 장바구니라 여기서 쓰면 첫 HTML 이 비어 버린다. 둘 다 같은 쿠키에서
   * 나오므로 커밋 순간에 값이 바뀌지 않는다 — 전이 자체가 없다. 단일 탭 기준이고,
   * 다른 탭이 그사이 쿠키를 바꾼 경우는 `useCartSync` 가 포커스 복귀 때 맞춘다.
   */
  const lines = hydrated ? storeLines : (initialLines ?? []);
  const { totalQuantity, totalPriceLabel } = cartTotals(lines);

  return (
    <span
      // cart 의 경계 색(hue 150). 값은 Panel 이 쓰는 것과 같은 통로로 내려간다.
      style={{ '--hue': 150 } as CSSProperties}
      className="remote-boundary inline-flex items-center gap-2 rounded-full px-3 py-1.5 font-mono text-xs text-text"
    >
      🛒 {label}
      <strong className="text-origin">{totalQuantity}</strong>
      <span className="text-muted">{totalPriceLabel}</span>
    </span>
  );
}
