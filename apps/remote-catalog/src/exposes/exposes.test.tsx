import '@testing-library/jest-dom/vitest';

import { PRODUCTS, PRODUCT_CATEGORIES, formatKRW } from '@mfa/contracts';
import { MAX_CART_QUANTITY } from '@mfa/store';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { clearGlobalRegistries } from '@tests/helpers/globals';

import { ORIGIN } from '../origin';

/**
 * catalog remote 가 host 에 노출하는 두 모듈과 그 안의 조각들.
 *
 * 가장 중요한 계약은 **상세 이동이 링크가 아니라 콜백**이라는 것이다(ADR-013).
 * host 가 라우팅을 소유하므로 remote 는 라우터를 모른다 — 그 대가로 이 자리에서는
 * 프리페치 · 새 탭 · 링크 복사를 잃는다.
 */
const A = PRODUCTS[0]!;
const SOLD_OUT = { ...A, id: 'so-001', name: '품절된 상품', stock: 0 };

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

const load = async () => ({
  ProductGrid: (await import('./ProductGrid')).default,
  ProductDetail: (await import('./ProductDetail')).default,
  RelatedProducts: (await import('./RelatedProducts')).default,
  ProductCard: (await import('../components/ProductCard')).ProductCard,
  StockBadge: (await import('../components/StockBadge')).StockBadge,
  useCart: (await import('@mfa/store')).useCart,
});

describe('StockBadge — 판정과 색이 한 곳에 있다', () => {
  it('재고가 있으면 숫자를 보여준다', async () => {
    const { StockBadge } = await load();
    render(<StockBadge stock={7} />);
    expect(screen.getByText('재고 7')).toBeInTheDocument();
  });

  it('0 이면 품절이다', async () => {
    const { StockBadge } = await load();
    render(<StockBadge stock={0} />);
    expect(screen.getByText('품절')).toBeInTheDocument();
  });

  it('품절이면 색도 같이 바뀐다', async () => {
    // 판정과 색이 두 벌이면 한쪽만 고쳤을 때 "빨간데 재고 3" 이 나온다.
    const { StockBadge } = await load();

    const { container, unmount } = render(<StockBadge stock={0} />);
    expect(
      container.querySelector('span')!.style.getPropertyValue('--hue'),
    ).toBe('0');
    unmount();

    const { container: ok } = render(<StockBadge stock={3} />);
    expect(ok.querySelector('span')!.style.getPropertyValue('--hue')).toBe(
      '140',
    );
  });
});

describe('ProductCard', () => {
  it('상품 정보를 그린다', async () => {
    const { ProductCard } = await load();

    render(<ProductCard product={A} />);

    expect(screen.getByText(A.name)).toBeInTheDocument();
    expect(screen.getByText(A.description)).toBeInTheDocument();
    expect(screen.getByText(formatKRW(A.price))).toBeInTheDocument();
    expect(screen.getByText(`★ ${A.rating.toFixed(1)}`)).toBeInTheDocument();
  });

  it('담기가 스토어에 넣는다', async () => {
    const { ProductCard, useCart } = await load();
    render(<ProductCard product={A} />);

    await userEvent.click(screen.getByRole('button', { name: '담기' }));

    expect(useCart.getState().lines).toEqual([
      expect.objectContaining({ productId: A.id, quantity: 1 }),
    ]);
  });

  it('품절이면 담기가 잠긴다', async () => {
    const { ProductCard, useCart } = await load();
    render(<ProductCard product={SOLD_OUT} />);

    const button = screen.getByRole('button', { name: '담기' });
    expect(button).toBeDisabled();

    await userEvent.click(button);
    expect(useCart.getState().lines).toEqual([]);
  });

  it('상한까지 담겼으면 더 담지 못한다', async () => {
    // 쿠키 코덱이 수량을 MAX_CART_QUANTITY 로 자른다. 화면이 그 위로 올라가면
    // 저장값과 갈려서 새로고침에 조용히 되돌아간다.
    const { ProductCard, useCart } = await load();
    useCart.getState().add(A, MAX_CART_QUANTITY);

    render(<ProductCard product={A} />);

    const button = await screen.findByRole('button', { name: '가득' });
    expect(button).toBeDisabled();

    await userEvent.click(button);
    expect(useCart.getState().lines[0]!.quantity).toBe(MAX_CART_QUANTITY);
  });

  it('상세 이동은 콜백이다 — 링크가 아니다 (ADR-013)', async () => {
    const onSelect = vi.fn();
    const { ProductCard } = await load();

    const { container } = render(
      <ProductCard product={A} onSelect={onSelect} />,
    );
    await userEvent.click(screen.getByRole('button', { name: A.name }));

    expect(onSelect).toHaveBeenCalledWith(A);
    expect(container.querySelectorAll('a')).toHaveLength(0);
  });

  it('onSelect 가 없으면 눌러도 아무 일이 없다', async () => {
    const { ProductCard } = await load();
    render(<ProductCard product={A} />);

    await expect(
      userEvent.click(screen.getByRole('button', { name: A.name })),
    ).resolves.toBeUndefined();
  });

  it('자기 경계 색으로 카테고리를 표시한다', async () => {
    const { ProductCard } = await load();

    render(<ProductCard product={A} />);

    const category = screen.getByText(A.category);
    expect(category.style.getPropertyValue('--hue')).toBe(
      String(ORIGIN.originHue),
    );
  });
});

describe('ProductGrid', () => {
  it('기본값은 전체 목록이다', async () => {
    const { ProductGrid } = await load();

    render(<ProductGrid />);

    for (const product of PRODUCTS) {
      expect(screen.getByText(product.name)).toBeInTheDocument();
    }
  });

  it('category 로 초기 필터를 정할 수 있다', async () => {
    const { ProductGrid } = await load();

    render(<ProductGrid category="keyboard" />);

    const shown = PRODUCTS.filter((p) => p.category === 'keyboard');
    const hidden = PRODUCTS.filter((p) => p.category !== 'keyboard');
    expect(shown.length).toBeGreaterThan(0);
    for (const p of shown) expect(screen.getByText(p.name)).toBeInTheDocument();
    for (const p of hidden) expect(screen.queryByText(p.name)).toBeNull();
  });

  it('필터 버튼이 목록을 좁힌다', async () => {
    const { ProductGrid } = await load();
    render(<ProductGrid />);

    await userEvent.click(screen.getByRole('button', { name: 'audio' }));

    const audio = PRODUCTS.filter((p) => p.category === 'audio');
    expect(screen.getAllByRole('article')).toHaveLength(audio.length);
  });

  it('all 로 되돌릴 수 있다', async () => {
    const { ProductGrid } = await load();
    render(<ProductGrid category="audio" />);

    await userEvent.click(screen.getByRole('button', { name: 'all' }));

    expect(screen.getAllByRole('article')).toHaveLength(PRODUCTS.length);
  });

  it('필터 버튼은 all + 모든 카테고리다', async () => {
    const { ProductGrid } = await load();
    const { container } = await Promise.resolve(render(<ProductGrid />));

    const header = container.querySelector('header')!;
    const labels = within(header)
      .getAllByRole('button')
      .map((b) => b.textContent);

    expect(labels).toEqual(['all', ...PRODUCT_CATEGORIES]);
  });

  it('선택된 필터만 primary 다', async () => {
    const { ProductGrid } = await load();
    const { container } = render(<ProductGrid category="audio" />);

    const header = container.querySelector('header')!;
    const active = within(header).getByRole('button', { name: 'audio' });
    expect(active).toHaveClass('bg-accent');
    expect(within(header).getByRole('button', { name: 'all' })).not.toHaveClass(
      'bg-accent',
    );
  });

  it('선택 콜백을 카드로 내려보낸다', async () => {
    const onSelect = vi.fn();
    const { ProductGrid } = await load();
    render(<ProductGrid category="keyboard" onSelect={onSelect} />);

    const first = PRODUCTS.find((p) => p.category === 'keyboard')!;
    await userEvent.click(screen.getByRole('button', { name: first.name }));

    expect(onSelect).toHaveBeenCalledWith(first);
  });

  it('필터를 바꾸면 host 에 알린다', async () => {
    // remote 는 URL 을 모른다. 그 선택을 주소에 남기는 건 host 의 정책이라
    // 여기서는 알리기만 하는 것이 계약이다.
    const onCategoryChange = vi.fn();
    const { ProductGrid } = await load();
    render(<ProductGrid onCategoryChange={onCategoryChange} />);

    await userEvent.click(screen.getByRole('button', { name: 'audio' }));

    expect(onCategoryChange).toHaveBeenCalledWith('audio');
  });

  it('알리지 않아도 자기 화면은 바꾼다', async () => {
    // 콜백은 옵셔널이다. 안 넘긴 host(배포가 한 주기 뒤처진 host 포함)에서도
    // 필터 자체는 그대로 동작해야 한다.
    const { ProductGrid } = await load();
    render(<ProductGrid />);

    await userEvent.click(screen.getByRole('button', { name: 'audio' }));

    const audio = PRODUCTS.filter((p) => p.category === 'audio');
    expect(screen.getAllByRole('button', { name: '담기' })).toHaveLength(
      audio.length,
    );
  });

  it('host 가 category 를 되돌리면 화면도 따라간다', async () => {
    // 뒤로 가기는 URL 만 되돌린다. 여기서 안 맞추면 주소와 화면이 갈라진다.
    const { ProductGrid } = await load();
    const { rerender } = render(<ProductGrid category="audio" />);

    rerender(<ProductGrid category="keyboard" />);

    const keyboard = PRODUCTS.filter((p) => p.category === 'keyboard');
    expect(screen.getAllByRole('button', { name: '담기' })).toHaveLength(
      keyboard.length,
    );
  });

  it('어느 remote 가 그렸는지 라벨로 밝힌다', async () => {
    const { ProductGrid } = await load();
    render(<ProductGrid />);
    expect(screen.getByText(ORIGIN.origin)).toBeInTheDocument();
  });
});

describe('ProductDetail', () => {
  it('상품을 카탈로그에서 찾아 그린다', async () => {
    const { ProductDetail } = await load();

    render(<ProductDetail productId={A.id} />);

    expect(screen.getByRole('heading', { name: A.name })).toBeInTheDocument();
    expect(screen.getByText(formatKRW(A.price))).toBeInTheDocument();
  });

  it('모르는 id 면 에러 상자를 보여준다 — 던지지 않는다', async () => {
    // productId 는 host 의 URL 파라미터에서 온다. 아무 값이나 올 수 있다.
    const { ProductDetail } = await load();

    render(<ProductDetail productId="없는-상품" />);

    expect(screen.getByText('상품을 찾을 수 없습니다')).toBeInTheDocument();
    expect(screen.getByText('productId=없는-상품')).toBeInTheDocument();
  });

  it('담기가 스토어에 넣는다', async () => {
    const { ProductDetail, useCart } = await load();
    render(<ProductDetail productId={A.id} />);

    await userEvent.click(
      screen.getByRole('button', { name: '장바구니에 담기' }),
    );

    expect(useCart.getState().lines).toEqual([
      expect.objectContaining({ productId: A.id }),
    ]);
  });

  it('링크를 그리지 않는다 (ADR-013)', async () => {
    const { ProductDetail } = await load();
    const { container } = render(<ProductDetail productId={A.id} />);
    expect(container.querySelectorAll('a')).toHaveLength(0);
  });
});

describe('RelatedProducts', () => {
  it('기준 상품 자신은 목록에 넣지 않는다', async () => {
    // host 는 상세 페이지의 `productId` 를 그대로 넘긴다. 거르지 않으면
    // 보고 있는 상품이 "함께 보는 상품" 에 한 번 더 나온다.
    const { RelatedProducts } = await load();

    render(<RelatedProducts productId={A.id} limit={PRODUCTS.length} />);

    expect(screen.queryByText(A.name)).not.toBeInTheDocument();
  });

  it('같은 카테고리를 먼저 채운다', async () => {
    const { RelatedProducts } = await load();
    const sameCategory = PRODUCTS.filter(
      (p) => p.category === A.category && p.id !== A.id,
    );
    // 이 성질을 보려면 같은 카테고리 상품이 목 데이터에 둘 이상 있어야 한다
    expect(sameCategory.length).toBeGreaterThan(0);

    render(<RelatedProducts productId={A.id} limit={sameCategory.length} />);

    for (const product of sameCategory) {
      expect(screen.getByText(product.name)).toBeInTheDocument();
    }
  });

  it('limit 이 개수를 자른다 — 기본값은 3 이다', async () => {
    const { RelatedProducts } = await load();

    const { container, unmount } = render(
      <RelatedProducts productId={A.id} limit={2} />,
    );
    expect(container.querySelectorAll('article')).toHaveLength(2);
    unmount();

    const { container: byDefault } = render(
      <RelatedProducts productId={A.id} />,
    );
    expect(byDefault.querySelectorAll('article')).toHaveLength(3);
  });

  it('모르는 id 여도 빈 화면을 만들지 않는다', async () => {
    // 그 경우 오류를 알리는 건 ProductDetail 의 몫이다 — 같은 말을 두 번 하지 않는다.
    const { RelatedProducts } = await load();

    const { container } = render(<RelatedProducts productId="없는-상품" />);

    expect(container.querySelectorAll('article')).toHaveLength(3);
  });

  it('선택은 콜백으로 위임한다 — 링크를 그리지 않는다 (ADR-013)', async () => {
    const { RelatedProducts } = await load();
    const onSelect = vi.fn();

    const { container } = render(
      <RelatedProducts productId={A.id} limit={1} onSelect={onSelect} />,
    );
    // 카드 안 버튼은 둘이다(이름 · 담기). 상세 이동은 **이름** 쪽이다.
    const card = container.querySelector('article')!;
    await userEvent.click(within(card).getAllByRole('button')[0]!);

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(container.querySelectorAll('a')).toHaveLength(0);
  });
});
