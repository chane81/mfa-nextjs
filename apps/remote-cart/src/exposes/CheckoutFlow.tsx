import { useState } from 'react';

import { formatKRW, type CartLine } from '@mfa/contracts';
import { cartTotals, useCart, useCartLines } from '@mfa/store';
import { Badge, Button, Panel } from '@mfa/ui';

import { ORIGIN, ORIGIN_HUE } from '../origin';

/** 이 모듈의 공개 계약 — `initialLines` 의 의미는 `CartPanel.tsx` 의 같은 주석 */
export interface CheckoutFlowProps {
  initialLines?: readonly CartLine[];
  /** 주문 완료 후 host 가 어디로 보낼지 결정 */
  onDone?: () => void;
  onContinueShopping?: () => void;
}

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
  initialLines,
}: CheckoutFlowProps) {
  /** 무엇을 그릴지는 `@mfa/store` 가 정한다 — 하이드레이션 경계도 탭 동기화도 그 안이다 */
  const lines = useCartLines(initialLines);
  const clear = useCart((state) => state.clear);
  const { totalPriceLabel, totalQuantity } = cartTotals(lines);
  const [placed, setPlaced] = useState(false);

  if (placed) {
    return (
      <Panel {...ORIGIN} title="주문 완료">
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

  return (
    <Panel
      {...ORIGIN}
      title="주문서"
      actions={<Badge hue={ORIGIN_HUE}>{totalQuantity}개</Badge>}
    >
      {lines.length === 0 ? (
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
      ) : (
        <>
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {lines.map((line) => (
              <li
                key={line.productId}
                className="flex justify-between rounded-md border border-line bg-surface-alt p-3 text-[13px]"
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
        </>
      )}
    </Panel>
  );
}
