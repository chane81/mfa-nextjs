import { useState } from 'react';

import { formatKRW, type CheckoutFlowProps } from '@mfa/contracts';
import { cartTotals, useCart, useHydrated } from '@mfa/store';
import { Badge, Button, Panel } from '@mfa/ui';

import { Reveal, settlingClass } from '../components/Reveal';

/**
 * host 에 노출되는 모듈: `cart/CheckoutFlow`
 *
 * 원래 별도 Next.js 앱(Multi-Zone)이 담당하던 결제 화면을 remote 로 옮겼다.
 * 이유: zone 경계를 넘으면 하드 내비게이션이 강제되어 SPA 설계가 무의미해진다.
 * remote 로 두면 라우팅이 host 안에 남아 소프트 내비게이션이 유지된다.
 */
export default function CheckoutFlow({
  onDone,
  onContinueShopping,
}: CheckoutFlowProps) {
  const hydrated = useHydrated();
  const lines = useCart((state) => state.lines);
  const clear = useCart((state) => state.clear);
  const { totalPriceLabel, totalQuantity } = cartTotals(lines);
  const [placed, setPlaced] = useState(false);

  if (placed) {
    return (
      <Panel origin="remote: cart · rsbuild" originHue={150} title="주문 완료">
        <p className="m-0 text-sm text-text">
          주문이 접수되었습니다. 장바구니를 비웠습니다.
        </p>
        <div>
          <Button variant="ghost" onClick={onDone}>
            계속 쇼핑하기
          </Button>
        </div>
      </Panel>
    );
  }

  /** 판단 근거는 `CartPanel` 과 같다 — 하이드레이션 전에는 둘 다 닫아 둔다 */
  const showEmpty = hydrated && lines.length === 0;
  const showLines = hydrated && lines.length > 0;

  return (
    <Panel
      /* 근거는 `CartPanel` 과 같다 — 확정 전에는 상자째 흐리다 */
      className={settlingClass(hydrated)}
      origin="remote: cart · rsbuild"
      originHue={150}
      title="주문서"
      actions={<Badge hue={150}>{totalQuantity}개</Badge>}
    >
      <div>
        <Reveal open={showEmpty}>
          <p className="m-0 text-[13px] text-muted">
            장바구니가 비어 있습니다.{' '}
            <button
              type="button"
              onClick={onContinueShopping}
              className="cursor-pointer border-none bg-none p-0 font-sans text-[13px] text-accent"
            >
              상품 담으러 가기
            </button>
          </p>
        </Reveal>

        <Reveal open={showLines}>
          <div className="flex flex-col gap-4">
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {lines.map((line, index) => (
                <li
                  key={line.productId}
                  className="flex animate-cart-line justify-between rounded-md border border-line bg-surface-alt p-3 text-[13px] motion-reduce:animate-none"
                  style={{ animationDelay: `${Math.min(index, 6) * 45}ms` }}
                >
                  <span>
                    {line.emoji} {line.name} × {line.quantity}
                  </span>
                  <span className="font-mono">
                    {formatKRW(line.unitPrice * line.quantity)}
                  </span>
                </li>
              ))}
            </ul>
            <div className="flex items-center justify-between border-t border-line pt-3">
              <strong>{totalPriceLabel}</strong>
              <Button
                onClick={() => {
                  clear();
                  setPlaced(true);
                }}
              >
                주문 확정
              </Button>
            </div>
          </div>
        </Reveal>
      </div>
    </Panel>
  );
}
