import '@testing-library/jest-dom/vitest';

import { PRODUCTS } from '@mfa/contracts';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  CART_COOKIE_MAX_AGE,
  CART_COOKIE_NAME,
  fromStoredLines,
  type StoredCartLine,
} from './cookie-codec';
import { CART_STORAGE_KEY, cartCookieStorage } from './cookie-storage';

/**
 * 여기 있는 건 **설정**뿐이다 — 배관은 `utils/cookie-storage`, 값의 모양은 `cookie-codec`.
 * 그래서 보는 것도 "그 둘에 제대로 위임하는가" 다.
 */
const A = PRODUCTS[0]!;
const lines = fromStoredLines([
  { id: A.id, q: 2 },
] as readonly StoredCartLine[]);
const envelope = JSON.stringify({ state: { lines } });

const clearCookies = () => {
  for (const part of document.cookie.split(/;\s*/)) {
    const name = part.split('=')[0];
    if (name) document.cookie = `${name}=; path=/; max-age=0`;
  }
};

beforeEach(clearCookies);

describe('CART_STORAGE_KEY', () => {
  it('쿠키 이름과 같은 값이다', () => {
    // 갈라지면 서버가 읽는 쿠키와 브라우저가 쓰는 쿠키가 다른 이름이 된다.
    expect(CART_STORAGE_KEY).toBe(CART_COOKIE_NAME);
  });
});

describe('cartCookieStorage', () => {
  it('codec 의 최소 표현으로 적는다', () => {
    cartCookieStorage.setItem(CART_STORAGE_KEY, envelope);

    const raw = decodeURIComponent(
      document.cookie
        .split(/;\s*/)
        .find((p) => p.startsWith(`${CART_STORAGE_KEY}=`))!
        .slice(CART_STORAGE_KEY.length + 1),
    );
    expect(JSON.parse(raw)).toEqual([{ id: A.id, q: 2 }]);
  });

  it('읽으면 codec 이 카탈로그에서 복원한 줄을 준다', () => {
    cartCookieStorage.setItem(CART_STORAGE_KEY, envelope);

    expect(
      JSON.parse(cartCookieStorage.getItem(CART_STORAGE_KEY) as string),
    ).toEqual({
      state: { lines },
    });
  });

  it('세션 쿠키가 아니다', () => {
    // maxAge 를 안 주면 브라우저를 닫을 때 사라져 "새로고침해도 남는다" 를 못 보여준다.
    expect(CART_COOKIE_MAX_AGE).toBeGreaterThan(0);
  });

  it('삭제하면 없는 것과 같아진다', () => {
    cartCookieStorage.setItem(CART_STORAGE_KEY, envelope);
    cartCookieStorage.removeItem(CART_STORAGE_KEY);

    expect(cartCookieStorage.getItem(CART_STORAGE_KEY)).toBeNull();
  });

  it('사용자가 고친 쿠키도 codec 이 걸러서 준다', () => {
    document.cookie = `${CART_STORAGE_KEY}=${encodeURIComponent(
      `[{"id":"없는-상품","q":9},{"id":"${A.id}","q":1e308}]`,
    )}; path=/`;

    const parsed = JSON.parse(
      cartCookieStorage.getItem(CART_STORAGE_KEY) as string,
    ) as { state: { lines: { productId: string; quantity: number }[] } };

    expect(parsed.state.lines).toHaveLength(1);
    expect(parsed.state.lines[0]!.quantity).toBe(99);
  });

  it('깨진 쿠키에도 던지지 않는다', () => {
    document.cookie = `${CART_STORAGE_KEY}=깨진값; path=/`;
    expect(() => cartCookieStorage.getItem(CART_STORAGE_KEY)).not.toThrow();
  });
});
