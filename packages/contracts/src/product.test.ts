import { describe, expect, it } from 'vitest';

import {
  PRODUCT_CATEGORIES,
  PRODUCTS,
  findProduct,
  formatKRW,
} from './product';

describe('findProduct', () => {
  it('있는 id 는 그 상품을 준다', () => {
    const first = PRODUCTS[0]!;
    expect(findProduct(first.id)).toBe(first);
  });

  it('없는 id · 빈 문자열은 undefined 다 (throw 하지 않는다)', () => {
    // 쿠키에 담겨 오는 값이라 모르는 id 가 정상적으로 들어온다.
    expect(findProduct('없는-상품')).toBeUndefined();
    expect(findProduct('')).toBeUndefined();
  });

  it('대소문자를 구분한다', () => {
    const first = PRODUCTS[0]!;
    expect(findProduct(first.id.toUpperCase())).toBeUndefined();
  });
});

describe('formatKRW', () => {
  // ⚠️ toLocaleString('ko-KR') 은 Node 의 ICU 데이터에 좌우된다.
  // 문자열 스냅샷을 박으면 ICU 가 다른 환경에서 이유 없이 깨진다 — 구조만 단언한다.
  it('원 단위를 붙인다', () => {
    expect(formatKRW(0)).toBe('0원');
    expect(formatKRW(1000)).toMatch(/^1[,.  ]?000원$/);
  });

  it('음수도 형식을 유지한다', () => {
    expect(formatKRW(-1000)).toMatch(/^-/);
    expect(formatKRW(-1000).endsWith('원')).toBe(true);
  });

  it('Infinity 는 무한대 기호가 된다', () => {
    // cookie-codec 의 수량 클램프가 막아주는 시나리오다. 막히기 전 모습을 고정해둔다.
    expect(formatKRW(Number.POSITIVE_INFINITY)).toBe('∞원');
  });
});

describe('PRODUCTS 데이터 무결성', () => {
  it('id 가 유일하다', () => {
    const ids = PRODUCTS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('모든 필드가 계약 범위 안에 있다', () => {
    for (const product of PRODUCTS) {
      expect(product.currency).toBe('KRW');
      expect(PRODUCT_CATEGORIES).toContain(product.category);
      expect(product.price).toBeGreaterThan(0);
      expect(Number.isInteger(product.price)).toBe(true);
      expect(product.rating).toBeGreaterThanOrEqual(0);
      expect(product.rating).toBeLessThanOrEqual(5);
      expect(product.stock).toBeGreaterThanOrEqual(0);
      expect(product.name.length).toBeGreaterThan(0);
      expect(product.emoji.length).toBeGreaterThan(0);
    }
  });

  it('카탈로그가 비어 있지 않다', () => {
    // 비면 cookie-codec 이 모든 줄을 조용히 버려서 장바구니가 영구히 빈 채로 돈다.
    expect(PRODUCTS.length).toBeGreaterThan(0);
  });
});
