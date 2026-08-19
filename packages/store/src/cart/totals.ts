import { formatKRW } from '@mfa/contracts';

import { type CartLine } from './create-store';

/** 담긴 줄에서 파생되는 값. 상태에 저장하지 않는다 */
export interface CartTotals {
  readonly totalQuantity: number;
  readonly totalPrice: number;
  readonly totalPriceLabel: string;
}

/**
 * 합계 계산. **셀렉터가 아니라 순수 함수다** — 훅 안에서 부르든 밖에서 부르든 같다.
 *
 * 셀렉터로 만들지 않은 이유: 합계는 상태의 조각이 아니라 화면이 쓰는 계산값이다.
 * 렌더 중에 부르는 평범한 함수로 두면 구독·비교와 아예 얽히지 않는다.
 *
 *   const lines = useCart((state) => state.lines);
 *   const { totalPriceLabel } = cartTotals(lines);
 */
export function cartTotals(lines: readonly CartLine[]): CartTotals {
  let totalQuantity = 0;
  let totalPrice = 0;
  for (const line of lines) {
    totalQuantity += line.quantity;
    totalPrice += line.unitPrice * line.quantity;
  }
  return { totalQuantity, totalPrice, totalPriceLabel: formatKRW(totalPrice) };
}
