import { formatKRW, type CartPanelProps } from '@mfa/contracts';
import { Button, Panel, useCart } from '@mfa/ui';

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
        <p className="m-0 text-[13px] text-muted">
          담긴 상품이 없습니다. catalog remote 에서 상품을 담아보세요.
        </p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {lines.map((line) => (
            <li
              key={line.productId}
              className="flex items-center gap-3 rounded-md border border-line bg-surface-alt p-3"
            >
              <span className="text-2xl">{line.emoji}</span>
              <div className="min-w-0 flex-1">
                <div className="overflow-hidden text-[13px] font-semibold text-ellipsis whitespace-nowrap text-text">
                  {line.name}
                </div>
                {!compact ? (
                  <div className="text-xs text-muted">
                    {formatKRW(line.unitPrice)} × {line.quantity}
                  </div>
                ) : null}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  onClick={() =>
                    store.setQuantity(line.productId, line.quantity - 1)
                  }
                >
                  −
                </Button>
                <span className="min-w-5 text-center font-mono text-text">
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

      <footer className="flex items-center justify-between border-t border-line pt-3">
        <span className="text-[13px] text-muted">
          {totalQuantity}개 · 합계{' '}
          <strong className="text-text">{totalPriceLabel}</strong>
        </span>
        <Button disabled={lines.length === 0} onClick={onCheckout}>
          결제하기
        </Button>
      </footer>
    </Panel>
  );
}
