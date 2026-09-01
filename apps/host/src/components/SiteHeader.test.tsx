import '@testing-library/jest-dom/vitest';

import { MF_FILES } from '@mfa/remote-config';
import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { clearGlobalRegistries } from '@tests/helpers/globals';

/**
 * host 헤더. **배지 자체가 cart remote 에서 온다** — 헤더 하나가 host 라우팅과
 * remote 소비를 동시에 걸치는 자리다.
 */
let pathname = '/';

vi.mock('next/navigation', () => ({
  usePathname: () => pathname,
}));

vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

/**
 * 오리진은 env 스텁과 web 엔트리가 **같은 값이어야** 의미가 있다.
 * `vi.mock` 팩토리는 호이스팅되어 바깥 `const` 를 못 보므로 `vi.hoisted` 에 둔다.
 */
const { CATALOG_ORIGIN, CART_ORIGIN, loadRemoteModule } = vi.hoisted(() => ({
  CATALOG_ORIGIN: 'https://catalog.example.com',
  CART_ORIGIN: 'https://cart.example.com',
  loadRemoteModule: vi.fn(),
}));

vi.mock('@/mf/loader', () => ({ loadRemoteModule }));

beforeEach(() => {
  clearGlobalRegistries();
  vi.resetModules();
  pathname = '/';
  loadRemoteModule.mockReset();
  loadRemoteModule.mockReturnValue(new Promise(() => {}));
  vi.stubEnv('REMOTE_CATALOG_PUBLIC_URL', CATALOG_ORIGIN);
  vi.stubEnv('REMOTE_CART_PUBLIC_URL', CART_ORIGIN);
  vi.stubEnv(
    'MFA_REMOTE_WEB_ENTRIES',
    JSON.stringify({
      catalog: `${CATALOG_ORIGIN}/${MF_FILES.webManifest}`,
      cart: `${CART_ORIGIN}/${MF_FILES.webManifest}`,
    }),
  );
});

const load = async () => (await import('./SiteHeader')).SiteHeader;

describe('내비게이션', () => {
  it('다섯 갈래를 모두 낸다', async () => {
    const SiteHeader = await load();

    render(<SiteHeader />);

    const nav = screen.getByRole('navigation');
    expect(
      within(nav)
        .getAllByRole('link')
        .map((a) => a.getAttribute('href')),
    ).toEqual(['/', '/cart', '/checkout', '/debug', '/lab']);
  });

  it('전부 링크다 — host 가 라우팅을 소유한다', async () => {
    // remote 쪽이 콜백을 쓰는 것과 대비되는 지점이다(ADR-013).
    const SiteHeader = await load();

    render(<SiteHeader />);

    const nav = screen.getByRole('navigation');
    for (const link of within(nav).getAllByRole('link')) {
      expect(link).toHaveAttribute('href');
    }
  });

  it('현재 경로만 강조한다', async () => {
    pathname = '/cart';
    const SiteHeader = await load();

    render(<SiteHeader />);

    const nav = screen.getByRole('navigation');
    expect(within(nav).getByRole('link', { name: '장바구니' })).toHaveClass(
      'text-accent',
    );
    expect(within(nav).getByRole('link', { name: '홈' })).toHaveClass(
      'text-muted',
    );
  });

  it('모르는 경로면 아무것도 강조하지 않는다', async () => {
    pathname = '/products/kb-001';
    const SiteHeader = await load();

    render(<SiteHeader />);

    const nav = screen.getByRole('navigation');
    for (const link of within(nav).getAllByRole('link')) {
      expect(link).toHaveClass('text-muted');
    }
  });

  it('좁은 화면에서 글자 단위로 쪼개지지 않게 막는다', async () => {
    // `whitespace-nowrap` 이 없으면 390px 에서 "장/바/구/니" 로 세로로 쪼개진다(실측).
    const SiteHeader = await load();

    render(<SiteHeader />);

    const nav = screen.getByRole('navigation');
    for (const link of within(nav).getAllByRole('link')) {
      expect(link).toHaveClass('whitespace-nowrap');
    }
  });
});

describe('cart 배지 슬롯', () => {
  it('cart/CartBadge 를 remote 로 불러온다', async () => {
    const SiteHeader = await load();

    render(<SiteHeader />);

    expect(loadRemoteModule).toHaveBeenCalledWith('cart/CartBadge');
  });

  it('서버가 읽은 장바구니를 그대로 넘긴다', async () => {
    // 배지가 첫 렌더부터 맞는 값을 그리게 하는 통로다.
    const lines = [
      {
        productId: 'kb-001',
        name: '키보드',
        emoji: '⌨️',
        unitPrice: 1000,
        quantity: 2,
      },
    ];
    loadRemoteModule.mockResolvedValue({
      default: ({
        initialLines,
      }: {
        initialLines?: { quantity: number }[];
      }) => <span>{initialLines?.[0]?.quantity}</span>,
    });
    const SiteHeader = await load();

    render(<SiteHeader initialLines={lines} />);

    expect(await screen.findByText('2')).toBeInTheDocument();
  });

  it('remote 를 기다리는 동안 짧은 스켈레톤을 쓴다', async () => {
    // 헤더가 통째로 밀리지 않게 라벨을 한 글자로 줄여둔 자리다.
    const SiteHeader = await load();

    render(<SiteHeader />);

    expect(screen.getByText('🛒 …')).toBeInTheDocument();
  });

  it('배지가 죽어도 헤더는 산다', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    loadRemoteModule.mockRejectedValue(new Error('ECONNREFUSED'));
    const SiteHeader = await load();

    render(<SiteHeader />);

    expect(
      await screen.findByText("remote 'cart' 를 불러오지 못했습니다"),
    ).toBeInTheDocument();
    expect(screen.getByRole('navigation')).toBeInTheDocument();
    error.mockRestore();
  });
});
