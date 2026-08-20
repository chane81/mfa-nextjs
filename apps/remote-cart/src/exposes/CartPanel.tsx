import { formatKRW, type CartPanelProps } from '@mfa/contracts';
import { cartTotals, useCart, useHydrated } from '@mfa/store';
import { Button, Panel } from '@mfa/ui';

import { Reveal, settlingClass } from '../components/Reveal';

/** host 에 노출되는 모듈: `cart/CartPanel` */
export default function CartPanel({
  onCheckout,
  compact = false,
}: CartPanelProps) {
  const hydrated = useHydrated();
  const lines = useCart((state) => state.lines);
  const { clear, setQuantity } = useCart((state) => ({
    clear: state.clear,
    setQuantity: state.setQuantity,
  }));
  const { totalQuantity, totalPriceLabel } = cartTotals(lines);

  /**
   * 하이드레이션 전에는 **둘 다 닫는다.**
   *
   * "담긴 상품이 없습니다"를 먼저 보여 주면, 장바구니가 비어 있지 않은 사람에게
   * 사실이 아닌 문장을 30ms 띄웠다 접는 꼴이 된다. 접힌 상태에서 시작해 실제 내용으로
   * 한 번 펼치면 층 이동이 한 방향으로만 일어나고, 그건 깜빡임이 아니라 등장으로 읽힌다.
   */
  const showEmpty = hydrated && lines.length === 0;
  const showLines = hydrated && lines.length > 0;

  return (
    <Panel
      /*
        접히는 건 목록뿐이라 합계 줄은 그대로 보인다 — 확정 전 `0개 · 합계 0원` 이
        한 프레임 노출된다. 그 자리만 따로 가리는 대신 상자를 통째로 흐리게 두고
        값이 확정되는 순간 또렷해지게 한다.
      */
      className={settlingClass(hydrated)}
      origin="remote: cart · rsbuild"
      originHue={150}
      title="장바구니"
      actions={
        showLines ? (
          <span className="inline-flex animate-cart-pop motion-reduce:animate-none">
            <Button variant="danger" onClick={() => clear()}>
              비우기
            </Button>
          </span>
        ) : null
      }
    >
      {/*
        두 상태를 형제로 두고 둘 다 높이 전환을 건다. Panel 의 `gap-4` 를 한 번만
        먹으려고 바깥을 한 겹 감쌌다 — 형제로 풀어 놓으면 접힌 쪽에도 간격이 붙는다.
      */}
      <div>
        <Reveal open={showEmpty}>
          <p className="m-0 text-[13px] text-muted">
            담긴 상품이 없습니다. catalog remote 에서 상품을 담아보세요.
          </p>
        </Reveal>

        <Reveal open={showLines}>
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {lines.map((line, index) => (
              <li
                key={line.productId}
                className="flex animate-cart-line items-center gap-3 rounded-md border border-line bg-surface-alt p-3 motion-reduce:animate-none"
                // 위에서부터 차례로 들어온다. 줄이 많아도 지연이 눈에 띄지 않게 상한을 둔다
                style={{ animationDelay: `${Math.min(index, 6) * 45}ms` }}
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
                      setQuantity(line.productId, line.quantity - 1)
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
                      setQuantity(line.productId, line.quantity + 1)
                    }
                  >
                    +
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </Reveal>
      </div>

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
