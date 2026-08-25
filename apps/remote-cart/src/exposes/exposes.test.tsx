import '@testing-library/jest-dom/vitest';

import { PRODUCTS } from '@mfa/contracts';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { clearGlobalRegistries } from '@tests/helpers/globals';

import { ORIGIN } from '../origin';

/**
 * cart remote 가 host 에 노출하는 세 모듈.
 *
 * 여기서 지키는 것은 **계약**이다 — props 로 받은 `initialLines` 를 그리고, 라우팅은
 * 콜백으로 host 에 넘긴다. remote 는 host 의 라우터를 모른다(ADR-013).
 */
const A = PRODUCTS[0]!;
const B = PRODUCTS[1]!;

const line = (product: (typeof PRODUCTS)[number], quantity: number) => ({
  productId: product.id,
  name: product.name,
  emoji: product.emoji,
  unitPrice: product.price,
  quantity,
});

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

/**
 * ⚠️ 클라이언트 렌더에서 `useCartLines` 는 **스토어**를 본다. `initialLines` 는 서버 렌더와
 * 하이드레이션 커밋 전까지만 쓰이는 값이라, 브라우저 동작을 보는 테스트는 스토어를 채워야
 * 한다(그게 실제 브라우저에서 일어나는 일이기도 하다 — 쿠키에서 복원된 상태).
 */
const load = async () => ({
  CartBadge: (await import('./CartBadge')).default,
  CartPanel: (await import('./CartPanel')).default,
  CheckoutFlow: (await import('./CheckoutFlow')).default,
  useCart: (await import('@mfa/store')).useCart,
});

/** 브라우저 상태를 만든다. 반환값은 같은 내용의 `initialLines` 다 */
const seed = async (
  entries: { product: (typeof PRODUCTS)[number]; quantity: number }[],
) => {
  const { useCart } = await import('@mfa/store');
  for (const { product, quantity } of entries)
    useCart.getState().add(product, quantity);
  return entries.map(({ product, quantity }) => line(product, quantity));
};

describe('CartBadge', () => {
  it('수량과 합계를 그린다', async () => {
    const { CartBadge } = await load();
    const initialLines = await seed([{ product: A, quantity: 2 }]);

    render(<CartBadge initialLines={initialLines} />);

    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText(/원$/)).toHaveTextContent(
      String(A.price * 2).slice(0, 3),
    );
  });

  it('라벨을 바꿀 수 있고 기본값이 있다', async () => {
    const { CartBadge } = await load();

    const { unmount } = render(<CartBadge initialLines={[]} />);
    expect(screen.getByText(/장바구니/)).toBeInTheDocument();
    unmount();

    render(<CartBadge label="담은 것" initialLines={[]} />);
    expect(screen.getByText(/담은 것/)).toBeInTheDocument();
  });

  it('비어 있으면 0 이다', async () => {
    const { CartBadge } = await load();
    render(<CartBadge initialLines={[]} />);
    expect(screen.getByText('0')).toBeInTheDocument();
  });

  it('자기 경계 색을 내려보낸다 — 어느 앱이 그렸는지 보이게', async () => {
    const { CartBadge } = await load();

    const { container } = render(<CartBadge initialLines={[]} />);

    expect(
      container.querySelector('span')!.style.getPropertyValue('--hue'),
    ).toBe(String(ORIGIN.originHue));
  });
});

describe('CartPanel', () => {
  it('비어 있으면 안내 문구를 보여준다', async () => {
    const { CartPanel } = await load();

    render(<CartPanel initialLines={[]} />);

    expect(screen.getByText(/담긴 상품이 없습니다/)).toBeInTheDocument();
  });

  it('비어 있으면 비우기 버튼을 내지 않는다', async () => {
    const { CartPanel } = await load();
    render(<CartPanel initialLines={[]} />);
    expect(screen.queryByRole('button', { name: '비우기' })).toBeNull();
  });

  it('줄마다 이름 · 이모지 · 수량을 그린다', async () => {
    const { CartPanel } = await load();
    const initialLines = await seed([
      { product: A, quantity: 2 },
      { product: B, quantity: 1 },
    ]);

    render(<CartPanel initialLines={initialLines} />);

    expect(screen.getByText(A.name)).toBeInTheDocument();
    expect(screen.getByText(B.name)).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });

  it('compact 면 단가 줄을 감춘다', async () => {
    const { CartPanel } = await load();
    const initialLines = await seed([{ product: A, quantity: 2 }]);

    const { unmount } = render(<CartPanel initialLines={initialLines} />);
    expect(screen.getByText(/×\s*2/)).toBeInTheDocument();
    unmount();

    render(<CartPanel initialLines={initialLines} compact />);
    expect(screen.queryByText(/×\s*2/)).toBeNull();
  });

  it('+ 버튼이 스토어 수량을 올린다', async () => {
    const { CartPanel, useCart } = await load();
    render(
      <CartPanel initialLines={await seed([{ product: A, quantity: 2 }])} />,
    );

    await userEvent.click(
      within(screen.getByRole('listitem')).getByRole('button', { name: '+' }),
    );

    expect(useCart.getState().lines[0]!.quantity).toBe(3);
  });

  it('− 로 0 이 되면 줄이 사라진다', async () => {
    const { CartPanel, useCart } = await load();
    render(
      <CartPanel initialLines={await seed([{ product: A, quantity: 1 }])} />,
    );

    await userEvent.click(
      within(screen.getByRole('listitem')).getByRole('button', { name: '−' }),
    );

    expect(useCart.getState().lines).toEqual([]);
  });

  it('비우기가 스토어를 비운다', async () => {
    const { CartPanel, useCart } = await load();
    render(
      <CartPanel initialLines={await seed([{ product: A, quantity: 1 }])} />,
    );

    await userEvent.click(screen.getByRole('button', { name: '비우기' }));

    expect(useCart.getState().lines).toEqual([]);
  });

  it('결제 진입은 콜백으로 host 에 넘긴다 — remote 는 라우터를 모른다', async () => {
    const onCheckout = vi.fn();
    const { CartPanel } = await load();
    const initialLines = await seed([{ product: A, quantity: 1 }]);
    render(<CartPanel initialLines={initialLines} onCheckout={onCheckout} />);

    await userEvent.click(screen.getByRole('button', { name: '결제하기' }));

    expect(onCheckout).toHaveBeenCalledOnce();
  });

  it('비어 있으면 결제 버튼이 잠긴다', async () => {
    const { CartPanel } = await load();
    render(<CartPanel initialLines={[]} />);
    expect(screen.getByRole('button', { name: '결제하기' })).toBeDisabled();
  });

  it('어느 remote 가 그렸는지 라벨로 밝힌다', async () => {
    const { CartPanel } = await load();
    render(<CartPanel initialLines={[]} />);
    expect(screen.getByText(ORIGIN.origin)).toBeInTheDocument();
  });
});

describe('CheckoutFlow', () => {
  it('비어 있으면 상품 담으러 가기를 콜백으로 넘긴다', async () => {
    const onContinueShopping = vi.fn();
    const { CheckoutFlow } = await load();
    render(
      <CheckoutFlow
        initialLines={[]}
        onContinueShopping={onContinueShopping}
      />,
    );

    await userEvent.click(
      screen.getByRole('button', { name: '상품 담으러 가기' }),
    );

    expect(onContinueShopping).toHaveBeenCalledOnce();
  });

  it('줄과 줄별 금액을 그린다', async () => {
    const { CheckoutFlow } = await load();
    const initialLines = await seed([{ product: A, quantity: 2 }]);

    render(<CheckoutFlow initialLines={initialLines} />);

    expect(screen.getByText(new RegExp(A.name))).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
  });

  it('주문 확정이 장바구니를 비우고 완료 화면으로 바꾼다', async () => {
    const { CheckoutFlow, useCart } = await load();
    render(
      <CheckoutFlow initialLines={await seed([{ product: A, quantity: 1 }])} />,
    );

    await userEvent.click(screen.getByRole('button', { name: '주문 확정' }));

    expect(screen.getByText(/주문이 접수되었습니다/)).toBeInTheDocument();
    expect(useCart.getState().lines).toEqual([]);
  });

  it('완료 후 이동도 콜백으로 넘긴다', async () => {
    const onDone = vi.fn();
    const { CheckoutFlow } = await load();
    const initialLines = await seed([{ product: A, quantity: 1 }]);
    render(<CheckoutFlow initialLines={initialLines} onDone={onDone} />);

    await userEvent.click(screen.getByRole('button', { name: '주문 확정' }));
    await userEvent.click(
      screen.getByRole('button', { name: '계속 쇼핑하기' }),
    );

    expect(onDone).toHaveBeenCalledOnce();
  });
});

describe('host 라우터를 모른다 (ADR-013)', () => {
  it('세 모듈 어디에도 링크가 없다', async () => {
    const { CartPanel, CheckoutFlow, CartBadge } = await load();
    const initialLines = await seed([{ product: A, quantity: 1 }]);

    const { container } = render(
      <>
        <CartBadge initialLines={initialLines} />
        <CartPanel initialLines={initialLines} />
        <CheckoutFlow initialLines={initialLines} />
      </>,
    );

    // 이동은 전부 콜백이다. remote 가 <a href> 를 그리면 host 의 라우팅을 우회한다.
    expect(container.querySelectorAll('a')).toHaveLength(0);
  });
});
