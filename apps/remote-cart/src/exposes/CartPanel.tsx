import { formatKRW, type CartPanelProps } from '@mfa/contracts';
import { cartTotals, useCart, useCartLines } from '@mfa/store';
import { Button, Panel } from '@mfa/ui';

import { ORIGIN } from '../origin';

/** host 에 노출되는 모듈: `cart/CartPanel` */
export default function CartPanel({
  onCheckout,
  compact = false,
  initialLines,
}: CartPanelProps) {
  /** 무엇을 그릴지는 `@mfa/store` 가 정한다 — 하이드레이션 경계도 탭 동기화도 그 안이다 */
  const lines = useCartLines(initialLines);
  const { clear, setQuantity } = useCart((state) => ({
    clear: state.clear,
    setQuantity: state.setQuantity,
  }));

  const { totalQuantity, totalPriceLabel } = cartTotals(lines);

  return (
    <Panel
      {...ORIGIN}
      title="장바구니"
      actions={
        lines.length > 0 ? (
          <Button variant="danger" onClick={() => clear()}>
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
                  onClick={() => setQuantity(line.productId, line.quantity - 1)}
                >
                  −
                </Button>
                <span className="min-w-5 text-center font-mono text-text">
                  {line.quantity}
                </span>
                <Button
                  variant="ghost"
                  onClick={() => setQuantity(line.productId, line.quantity + 1)}
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
