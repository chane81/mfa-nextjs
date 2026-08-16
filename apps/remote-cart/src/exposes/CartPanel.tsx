import { formatKRW, type CartPanelProps } from '@mfa/contracts';
import { Button, Panel, tokens, useCart } from '@mfa/ui';

/** host 에 노출되는 모듈: `cart/CartPanel` */
export default function CartPanel({
  onCheckout,
  compact = false,
}: CartPanelProps) {
  const { lines, totalQuantity, totalPriceLabel, store } = useCart();

  return (
    <Panel
      origin="remote: cart · rsbuild"
      originHue={150}
      title="장바구니"
      actions={
        lines.length > 0 ? (
          <Button variant="danger" onClick={() => store.clear()}>
            비우기
          </Button>
        ) : null
      }
    >
      {lines.length === 0 ? (
        <p style={{ margin: 0, color: tokens.color.textMuted, fontSize: 13 }}>
          담긴 상품이 없습니다. catalog remote 에서 상품을 담아보세요.
        </p>
      ) : (
        <ul
          style={{
            listStyle: 'none',
            margin: 0,
            padding: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: tokens.space(2),
          }}
        >
          {lines.map((line) => (
            <li
              key={line.productId}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: tokens.space(3),
                background: tokens.color.surfaceAlt,
                border: `1px solid ${tokens.color.border}`,
                borderRadius: tokens.radius.md,
                padding: tokens.space(3),
              }}
            >
              <span style={{ fontSize: 24 }}>{line.emoji}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    color: tokens.color.text,
                    fontSize: 13,
                    fontWeight: 600,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {line.name}
                </div>
                {!compact ? (
                  <div style={{ color: tokens.color.textMuted, fontSize: 12 }}>
                    {formatKRW(line.unitPrice)} × {line.quantity}
                  </div>
                ) : null}
              </div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: tokens.space(2),
                }}
              >
                <Button
                  variant="ghost"
                  onClick={() =>
                    store.setQuantity(line.productId, line.quantity - 1)
                  }
                >
                  −
                </Button>
                <span
                  style={{
                    fontFamily: tokens.font.mono,
                    color: tokens.color.text,
                    minWidth: 20,
                    textAlign: 'center',
                  }}
                >
                  {line.quantity}
                </span>
                <Button
                  variant="ghost"
                  onClick={() =>
                    store.setQuantity(line.productId, line.quantity + 1)
                  }
                >
                  +
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <footer
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderTop: `1px solid ${tokens.color.border}`,
          paddingTop: tokens.space(3),
        }}
      >
        <span style={{ color: tokens.color.textMuted, fontSize: 13 }}>
          {totalQuantity}개 · 합계{' '}
          <strong style={{ color: tokens.color.text }}>
            {totalPriceLabel}
          </strong>
        </span>
        <Button disabled={lines.length === 0} onClick={onCheckout}>
          결제하기
        </Button>
      </footer>
    </Panel>
  );
}
