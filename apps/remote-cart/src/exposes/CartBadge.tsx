import type { CartBadgeProps } from '@mfa/contracts';
import { tokens, useCart } from '@mfa/ui';

/**
 * host 에 노출되는 모듈: `cart/CartBadge`
 * host 헤더에 박히는 아주 작은 remote — "조각 단위 소비" 실험용.
 */
export default function CartBadge({ label = '장바구니' }: CartBadgeProps) {
  const { totalQuantity, totalPriceLabel } = useCart();

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: tokens.space(2),
        border: `1px dashed hsl(150 70% 62% / 0.5)`,
        borderRadius: 999,
        padding: '6px 12px',
        fontSize: 12,
        fontFamily: tokens.font.mono,
        color: tokens.color.text,
      }}
    >
      🛒 {label}
      <strong style={{ color: 'hsl(150 70% 72%)' }}>{totalQuantity}</strong>
      <span style={{ color: tokens.color.textMuted }}>{totalPriceLabel}</span>
    </span>
  );
}
