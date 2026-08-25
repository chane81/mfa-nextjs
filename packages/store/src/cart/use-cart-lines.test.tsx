import '@testing-library/jest-dom/vitest';

import { PRODUCTS } from '@mfa/contracts';
import { act, render, screen } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { clearGlobalRegistries } from '@tests/helpers/globals';

import { type CartLine } from './create-store';

/**
 * 화면이 부르는 훅은 이거 하나다. 감추는 것이 셋 — 탭 동기화, 하이드레이션 경계,
 * 경계 전후의 값 전환.
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

const setup = async () => {
  const { useCartLines } = await import('./use-cart-lines');
  const { useCart } = await import('./create-store');

  function Probe({ initialLines }: { initialLines?: readonly CartLine[] }) {
    const lines = useCartLines(initialLines);
    return (
      <span data-testid="ids">{lines.map((l) => l.productId).join(',')}</span>
    );
  }

  return { Probe, useCart };
};

describe('useCartLines', () => {
  it('서버 렌더에서는 initialLines 를 쓴다', async () => {
    // zustand 의 useStore 는 하이드레이션 렌더에서 서버 스냅샷(빈 장바구니)을 쓴다.
    // 그래서 그 한 렌더까지는 host 가 쿠키에서 읽어 넘긴 값이 화면을 그린다.
    const { Probe } = await setup();
    const initial = [
      {
        productId: A.id,
        name: A.name,
        emoji: A.emoji,
        unitPrice: A.price,
        quantity: 1,
      },
    ];

    expect(renderToString(<Probe initialLines={initial} />)).toContain(A.id);
  });

  it('서버 렌더에서 initialLines 가 없으면 빈 목록이다', async () => {
    const { Probe } = await setup();
    expect(renderToString(<Probe />)).toContain('><');
  });

  it('서버 렌더는 스토어 상태를 보지 않는다', async () => {
    const { Probe, useCart } = await setup();
    useCart.getState().add(B);

    // 스토어에는 B 가 있지만 서버 스냅샷은 빈 장바구니다.
    expect(renderToString(<Probe />)).not.toContain(B.id);
  });

  it('클라이언트 렌더에서는 스토어를 쓴다', async () => {
    const { Probe, useCart } = await setup();
    useCart.getState().add(A);

    render(<Probe initialLines={[]} />);

    expect(screen.getByTestId('ids')).toHaveTextContent(A.id);
  });

  it('커밋 후 스토어가 바뀌면 화면이 따라온다', async () => {
    const { Probe, useCart } = await setup();
    render(<Probe />);

    act(() => useCart.getState().add(B));

    expect(screen.getByTestId('ids')).toHaveTextContent(B.id);
  });

  it('두 값이 같은 쿠키에서 나오므로 커밋 순간 화면이 바뀌지 않는다', async () => {
    // 이게 localStorage 시절과 결정적으로 다른 점이다. 그때는 서버가 값을 몰라
    // 두 값이 달랐고, 그 차이가 한 프레임짜리 깜빡임이었다.
    const { CART_COOKIE_NAME } = await import('./cookie-codec');
    document.cookie = `${CART_COOKIE_NAME}=${encodeURIComponent(
      `[{"id":"${A.id}","q":1}]`,
    )}; path=/`;

    const { Probe } = await setup();
    const { parseCartCookie } = await import('./cookie-codec');
    const initial = parseCartCookie(`[{"id":"${A.id}","q":1}]`);

    const server = renderToString(<Probe initialLines={initial} />);
    render(<Probe initialLines={initial} />);

    expect(server).toContain(A.id);
    expect(screen.getByTestId('ids')).toHaveTextContent(A.id);
  });
});
