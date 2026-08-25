import '@testing-library/jest-dom/vitest';

import { PRODUCTS } from '@mfa/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { clearGlobalRegistries } from '@tests/helpers/globals';

import { MAX_CART_QUANTITY, serializeCartCookie } from './cookie-codec';

/**
 * 스토어 액션. 렌더러 없이 `getState()` 로 본다 — 액션은 순수 상태 전이라
 * 화면을 붙이면 검증할 것보다 노이즈가 많아진다.
 *
 * 이 모듈은 top-level 에서 `globalSingleton` 으로 인스턴스를 만든다. 매번 레지스트리를
 * 비우고 새로 들이지 않으면 앞 테스트의 장바구니를 그대로 물려받는다.
 */
const A = PRODUCTS[0]!;
const B = PRODUCTS[1]!;

const clearCookies = () => {
  for (const part of document.cookie.split(/;\s*/)) {
    const name = part.split('=')[0];
    if (name) document.cookie = `${name}=; path=/; max-age=0`;
  }
};

beforeEach(() => {
  clearGlobalRegistries();
  clearCookies();
  vi.resetModules();
});

const store = async () => (await import('./create-store')).useCart;

describe('add', () => {
  it('상품을 장바구니 줄로 투영한다', async () => {
    const useCart = await store();

    useCart.getState().add(A);

    expect(useCart.getState().lines).toEqual([
      {
        productId: A.id,
        name: A.name,
        emoji: A.emoji,
        // `price` 를 `unitPrice` 로 옮긴다 — 계약 이름이 다르다
        unitPrice: A.price,
        quantity: 1,
      },
    ]);
  });

  it('수량을 지정할 수 있다', async () => {
    const useCart = await store();
    useCart.getState().add(A, 3);
    expect(useCart.getState().lines[0]!.quantity).toBe(3);
  });

  it('같은 상품은 줄을 늘리지 않고 수량을 더한다', async () => {
    // "줄마다 상품이 유일하다" 를 지킨다. 안 지키면 같은 React key 가 두 번 쓰이고
    // setQuantity · remove 가 두 줄을 동시에 건드린다.
    const useCart = await store();

    useCart.getState().add(A, 2);
    useCart.getState().add(A, 3);

    expect(useCart.getState().lines).toHaveLength(1);
    expect(useCart.getState().lines[0]!.quantity).toBe(5);
  });

  it('다른 상품은 뒤에 붙인다', async () => {
    const useCart = await store();

    useCart.getState().add(A);
    useCart.getState().add(B);

    expect(useCart.getState().lines.map((l) => l.productId)).toEqual([
      A.id,
      B.id,
    ]);
  });

  it('수량 상한이 없다 — cookie-codec 의 클램프와 비대칭이다', async () => {
    /**
     * 의도된 비대칭이다. 상한(`MAX_CART_QUANTITY`)은 **사용자가 고칠 수 있는 입력**
     * (쿠키)을 막으려고 둔 것이고, 스토어의 `add` 는 화면의 버튼이 부른다.
     *
     * 다만 결과는 알고 있어야 한다 — 상한을 넘긴 상태는 쿠키를 한 번 왕복하면 잘린다.
     * 이 테스트는 그 성질을 고정한다. 상한을 `add` 에도 걸기로 하면 여기가 먼저 깨진다.
     */
    const useCart = await store();

    useCart.getState().add(A, MAX_CART_QUANTITY + 50);

    expect(useCart.getState().lines[0]!.quantity).toBe(MAX_CART_QUANTITY + 50);

    const { parseCartCookie } = await import('./cookie-codec');
    const roundTripped = parseCartCookie(
      serializeCartCookie(useCart.getState().lines),
    );
    expect(roundTripped[0]!.quantity).toBe(MAX_CART_QUANTITY);
  });
});

describe('setQuantity', () => {
  it('수량을 바꾼다', async () => {
    const useCart = await store();
    useCart.getState().add(A);

    useCart.getState().setQuantity(A.id, 7);

    expect(useCart.getState().lines[0]!.quantity).toBe(7);
  });

  it.each([0, -1])('%s 이하면 줄을 지운다', async (quantity) => {
    // 화면에서 수량을 0 으로 내리는 것과 "빼기" 는 같은 동작이다.
    const useCart = await store();
    useCart.getState().add(A);

    useCart.getState().setQuantity(A.id, quantity);

    expect(useCart.getState().lines).toEqual([]);
  });

  it('없는 상품이면 아무 일도 없다', async () => {
    const useCart = await store();
    useCart.getState().add(A);

    useCart.getState().setQuantity('없는-상품', 5);

    expect(useCart.getState().lines).toHaveLength(1);
  });

  it('다른 줄은 건드리지 않는다', async () => {
    const useCart = await store();
    useCart.getState().add(A, 2);
    useCart.getState().add(B, 3);

    useCart.getState().setQuantity(A.id, 9);

    expect(useCart.getState().lines.map((l) => l.quantity)).toEqual([9, 3]);
  });
});

describe('remove · clear', () => {
  it('remove 는 그 줄만 지운다', async () => {
    const useCart = await store();
    useCart.getState().add(A);
    useCart.getState().add(B);

    useCart.getState().remove(A.id);

    expect(useCart.getState().lines.map((l) => l.productId)).toEqual([B.id]);
  });

  it('remove 는 없는 상품에도 던지지 않는다', async () => {
    const useCart = await store();
    expect(() => useCart.getState().remove('없는-상품')).not.toThrow();
  });

  it('clear 는 전부 비운다', async () => {
    const useCart = await store();
    useCart.getState().add(A);
    useCart.getState().add(B);

    useCart.getState().clear();

    expect(useCart.getState().lines).toEqual([]);
  });
});

describe('persist — 쿠키에 lines 만 싣는다', () => {
  it('상태가 바뀌면 쿠키에 최소 표현으로 적는다', async () => {
    const { CART_COOKIE_NAME } = await import('./cookie-codec');
    const useCart = await store();

    useCart.getState().add(A, 2);

    const raw = decodeURIComponent(
      document.cookie
        .split(/;\s*/)
        .find((p) => p.startsWith(`${CART_COOKIE_NAME}=`))!
        .slice(CART_COOKIE_NAME.length + 1),
    );
    expect(JSON.parse(raw)).toEqual([{ id: A.id, q: 2 }]);
  });

  it('액션은 저장하지 않는다', async () => {
    const { CART_COOKIE_NAME } = await import('./cookie-codec');
    const useCart = await store();

    useCart.getState().add(A);

    const cookie = document.cookie;
    expect(cookie).not.toContain('add');
    expect(cookie).not.toContain('setQuantity');
    expect(cookie).toContain(CART_COOKIE_NAME);
  });

  it('스토어 생성 시점에 쿠키에서 복원한다', async () => {
    // 동기 저장소라 persist 가 생성 시점에 복원을 끝낸다. 비동기였다면 첫 렌더가
    // 빈 상태가 되어 — 없애려던 깜빡임이 그대로 돌아온다.
    const { CART_COOKIE_NAME } = await import('./cookie-codec');
    document.cookie = `${CART_COOKIE_NAME}=${encodeURIComponent(
      `[{"id":"${A.id}","q":4}]`,
    )}; path=/`;

    const useCart = await store();

    expect(useCart.getState().lines).toEqual([
      expect.objectContaining({ productId: A.id, quantity: 4 }),
    ]);
  });

  it('복원 경로에서도 카탈로그에서 값을 다시 읽는다', async () => {
    const { CART_COOKIE_NAME } = await import('./cookie-codec');
    document.cookie = `${CART_COOKIE_NAME}=${encodeURIComponent(
      `[{"id":"${A.id}","q":1}]`,
    )}; path=/`;

    const useCart = await store();

    expect(useCart.getState().lines[0]!.unitPrice).toBe(A.price);
    expect(useCart.getState().lines[0]!.name).toBe(A.name);
  });
});

describe('globalSingleton — 번들 경계를 넘어 하나다', () => {
  it('모듈이 다시 평가돼도 같은 인스턴스다', async () => {
    // host · catalog · cart 가 이 모듈의 사본을 각자 가진다. 인스턴스가 셋이 되면
    // "catalog 에서 담았는데 cart 배지는 0" 이 된다.
    const first = await store();
    first.getState().add(A);

    vi.resetModules();
    const second = await store();

    expect(second).toBe(first);
    expect(second.getState().lines).toHaveLength(1);
  });
});
