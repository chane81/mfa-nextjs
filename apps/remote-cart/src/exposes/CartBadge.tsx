import type { CSSProperties } from 'react';

import type { CartLine } from '@mfa/contracts';
import { cartTotals, useCartLines } from '@mfa/store';

import { ORIGIN_HUE } from '../origin';

/** 이 모듈의 공개 계약 — `initialLines` 의 의미는 `CartPanel.tsx` 의 같은 주석 */
export interface CartBadgeProps {
  initialLines?: readonly CartLine[];
  label?: string;
}

/**
 * host 에 노출되는 모듈: `cart/CartBadge`
 * host 헤더에 박히는 아주 작은 remote — "조각 단위 소비" 실험용.
 */
export default function CartBadge({
  label = '장바구니',
  initialLines,
}: CartBadgeProps) {
  /** 무엇을 그릴지는 `@mfa/store` 가 정한다 — 하이드레이션 경계도 탭 동기화도 그 안이다 */
  const lines = useCartLines(initialLines);
  const { totalQuantity, totalPriceLabel } = cartTotals(lines);

  return (
    <span
      // cart 의 경계 색. 값은 Panel 이 쓰는 것과 같은 통로로 내려간다.
      style={{ '--hue': ORIGIN_HUE } as CSSProperties}
      className="remote-boundary inline-flex items-center gap-2 rounded-full px-3 py-1.5 font-mono text-xs text-text"
    >
      🛒 {label}
      <strong className="text-origin">{totalQuantity}</strong>
      <span className="text-muted">{totalPriceLabel}</span>
    </span>
  );
}
