import { formatKRW, type CartPanelProps } from '@mfa/contracts';
import { cartTotals, useCart, useCartSync, useHydrated } from '@mfa/store';
import { Button, Panel } from '@mfa/ui';

/** host 에 노출되는 모듈: `cart/CartPanel` */
export default function CartPanel({
  onCheckout,
  compact = false,
  initialLines,
}: CartPanelProps) {
  /** 다른 탭이 장바구니를 바꿨으면 이 탭이 앞으로 나올 때 다시 읽는다 */
  useCartSync();

  const hydrated = useHydrated();
  const storeLines = useCart((state) => state.lines);
  const { clear, setQuantity } = useCart((state) => ({
    clear: state.clear,
    setQuantity: state.setQuantity,
  }));

  /**
   * 하이드레이션 커밋 전에는 host 가 쿠키에서 읽어 넘긴 값을 쓴다 — 스토어의 서버
   * 스냅샷은 빈 장바구니다. 둘 다 같은 쿠키에서 나오므로 값이 바뀌지 않는다
   * (단일 탭 기준. 다른 탭이 그사이 바꿨다면 `useCartSync` 가 포커스 때 맞춘다).
   */
  const lines = hydrated ? storeLines : (initialLines ?? []);
  const { totalQuantity, totalPriceLabel } = cartTotals(lines);

  return (
    <Panel
      origin="remote: cart · rsbuild"
      originHue={150}
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
