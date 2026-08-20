import type { CSSProperties } from 'react';

import type { CartBadgeProps } from '@mfa/contracts';
import { cartTotals, useCart, useHydrated } from '@mfa/store';

import { Reveal } from '../components/Reveal';

/**
 * host 에 노출되는 모듈: `cart/CartBadge`
 * host 헤더에 박히는 아주 작은 remote — "조각 단위 소비" 실험용.
 */
export default function CartBadge({ label = '장바구니' }: CartBadgeProps) {
  const hydrated = useHydrated();
  const { totalQuantity, totalPriceLabel } = cartTotals(
    useCart((state) => state.lines),
  );

  return (
    <span
      // cart 의 경계 색(hue 150). 값은 Panel 이 쓰는 것과 같은 통로로 내려간다.
      style={{ '--hue': 150 } as CSSProperties}
      className="remote-boundary inline-flex items-center gap-2 rounded-full px-3 py-1.5 font-mono text-xs text-text"
    >
      🛒 {label}
      {/*
        하이드레이션 전에는 접어 둔다. 여기서 `0`·`0원` 을 먼저 띄우면 실제 값이 들어오는
        순간 알약 폭이 튀고(실측 130 → 188px), 그건 헤더 전체의 층 이동으로 번진다.
        빈 장바구니여도 펼치는 이유는 `0` 이 감춰야 할 값이 아니라 **정답**이기 때문이다 —
        가릴 대상은 값이 아니라 "아직 모른다"는 상태다.
      */}
      <Reveal axis="x" open={hydrated}>
        <strong className="text-origin">{totalQuantity}</strong>{' '}
        <span className="text-muted">{totalPriceLabel}</span>
      </Reveal>
    </span>
  );
}
