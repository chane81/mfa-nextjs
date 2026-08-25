import { PRODUCTS } from '@mfa/contracts';
import { describe, expect, it } from 'vitest';

import { fromStoredLines, type StoredCartLine } from './cookie-codec';
import { cartTotals } from './totals';

const A = PRODUCTS[0]!;
const B = PRODUCTS[1]!;
const lines = (value: unknown) =>
  fromStoredLines(value as readonly StoredCartLine[]);

describe('cartTotals', () => {
  it('빈 장바구니는 0 이다', () => {
    expect(cartTotals([])).toEqual({
      totalQuantity: 0,
      totalPrice: 0,
      totalPriceLabel: '0원',
    });
  });

  it('수량과 금액을 각각 누적한다', () => {
    const result = cartTotals(
      lines([
        { id: A.id, q: 2 },
        { id: B.id, q: 3 },
      ]),
    );
    expect(result.totalQuantity).toBe(5);
    expect(result.totalPrice).toBe(A.price * 2 + B.price * 3);
  });

  it('라벨은 합계 금액에서 나온다', () => {
    // ICU 로케일에 좌우되므로 문자열 스냅샷 대신 구조를 본다.
    const result = cartTotals(lines([{ id: A.id, q: 1 }]));
    expect(result.totalPriceLabel.endsWith('원')).toBe(true);
    expect(result.totalPriceLabel.replace(/\D/g, '')).toBe(String(A.price));
  });

  it('한 줄짜리와 같은 줄을 나눠 담은 것의 합계가 같다', () => {
    // cookie-codec 이 병합해주므로 결과가 같아야 한다.
    expect(
      cartTotals(
        lines([
          { id: A.id, q: 1 },
          { id: A.id, q: 2 },
        ]),
      ),
    ).toEqual(cartTotals(lines([{ id: A.id, q: 3 }])));
  });

  it('상태에 저장하지 않는 파생값이다 — 같은 입력에 같은 출력', () => {
    const input = lines([{ id: A.id, q: 2 }]);
    expect(cartTotals(input)).toEqual(cartTotals(input));
  });
});
