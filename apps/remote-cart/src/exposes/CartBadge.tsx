import type { CSSProperties } from 'react';

import type { CartBadgeProps } from '@mfa/contracts';
import { useCart } from '@mfa/ui';

/**
 * host 에 노출되는 모듈: `cart/CartBadge`
 * host 헤더에 박히는 아주 작은 remote — "조각 단위 소비" 실험용.
 */
export default function CartBadge({ label = '장바구니' }: CartBadgeProps) {
  const { totalQuantity, totalPriceLabel } = useCart();

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
