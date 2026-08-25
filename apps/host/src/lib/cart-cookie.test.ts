import { PRODUCTS } from '@mfa/contracts';
import { CART_COOKIE_NAME } from '@mfa/store';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * host 가 장바구니를 "아는" 유일한 지점. 하는 일은 **전달**이다 —
 * 포맷도 의미도 `@mfa/store` 가 쥔다.
 */
const cookieStore = { get: vi.fn() };
vi.mock('next/headers', () => ({
  cookies: async () => cookieStore,
}));

const A = PRODUCTS[0]!;

beforeEach(() => {
  cookieStore.get.mockReset();
});

const readWith = async (value: string | undefined) => {
  cookieStore.get.mockReturnValue(value === undefined ? undefined : { value });
  const { readCartLines } = await import('./cart-cookie');
  return readCartLines();
};

describe('readCartLines', () => {
  it('쿠키 이름은 store 가 정한 것을 쓴다', async () => {
    await readWith(undefined);
    expect(cookieStore.get).toHaveBeenCalledWith(CART_COOKIE_NAME);
  });

  it('쿠키가 없으면 빈 장바구니다', async () => {
    expect(await readWith(undefined)).toEqual([]);
  });

  it('쿠키를 장바구니 줄로 되돌린다', async () => {
    expect(await readWith(`[{"id":"${A.id}","q":2}]`)).toEqual([
      {
        productId: A.id,
        name: A.name,
        emoji: A.emoji,
        unitPrice: A.price,
        quantity: 2,
      },
    ]);
  });

  it('값을 한 번 더 디코딩하지 않는다', async () => {
    // `.value` 는 Next 의 쿠키 파서가 이미 decodeURIComponent 를 부른 결과다
    // (@edge-runtime/cookies). 여기서 또 벗기면 값에 % 가 들어오는 순간
    // 서버만 URIError 로 빈 장바구니가 되고 브라우저는 멀쩡히 파싱해서,
    // 첫 HTML 과 하이드레이션이 갈라진다.
    const encoded = encodeURIComponent(`[{"id":"${A.id}","q":2}]`);
    expect(await readWith(encoded)).toEqual([]);
  });

  it('깨진 쿠키에도 던지지 않는다', async () => {
    expect(await readWith('깨진 값')).toEqual([]);
    expect(await readWith('')).toEqual([]);
  });

  it('모르는 상품은 그 줄만 버린다', async () => {
    expect(
      await readWith(`[{"id":"없는-상품","q":1},{"id":"${A.id}","q":1}]`),
    ).toEqual([expect.objectContaining({ productId: A.id })]);
  });
});
