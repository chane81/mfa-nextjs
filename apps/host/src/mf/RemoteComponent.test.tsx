import '@testing-library/jest-dom/vitest';

import { MF_FILES, stylesPath } from '@mfa/remote-config';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { clearGlobalRegistries } from '@tests/helpers/globals';

/**
 * 모든 remote 소비가 지나가는 자리. 여기서 보는 것은 셋이다 —
 * 스켈레톤 → remote 마크업 전이, 스타일시트 주소 조립, 그리고 실패 시 경계로 떨어지기.
 *
 * `runtime.ts` 는 `@module-federation/runtime` 을 초기화하므로 통째로 모킹한다.
 * 여기서 검증할 것은 MF 런타임이 아니라 이 컴포넌트의 조립이다.
 */
const loadRemoteModule = vi.fn();

vi.mock('./runtime', () => ({
  loadRemoteModule: (id: string) => loadRemoteModule(id),
  REMOTE_ENTRIES: {
    catalog: 'https://catalog.example.com/mf-manifest.json',
    cart: 'https://cart.example.com/mf-manifest.json',
  },
}));

const ORIGIN = 'https://catalog.example.com';

beforeEach(() => {
  clearGlobalRegistries();
  vi.resetModules();
  loadRemoteModule.mockReset();
  vi.stubEnv('REMOTE_CATALOG_PUBLIC_URL', ORIGIN);
  vi.stubEnv('REMOTE_CART_PUBLIC_URL', 'https://cart.example.com');
  vi.stubEnv(
    'MFA_REMOTE_WEB_ENTRIES',
    JSON.stringify({
      catalog: `${ORIGIN}/${MF_FILES.webManifest}`,
      cart: `https://cart.example.com/${MF_FILES.webManifest}`,
    }),
  );
});

const load = () => import('./RemoteComponent');

/**
 * ⚠️ `<link>` 개수를 절대값으로 세지 않는다.
 *
 * `precedence` 가 붙은 링크는 React 19 가 `<head>` 로 **호이스팅**하고, RTL 의 cleanup 은
 * 렌더 컨테이너만 지우므로 그 링크는 다음 테스트까지 살아남는다. 게다가 React 는 문서
 * 단위로 리소스를 기억해서, 같은 href 를 두 번째 렌더에서 **다시 만들지 않는 경우도 있다**
 * (손으로 지우면 아예 다시 안 만든다 — 실측). 즉 개수는 테스트 순서에 따라 달라진다.
 *
 * 그래서 여기서는 "그 주소의 링크가 붙었는가" 만 본다. **중복 제거는 단언하지 않는다** —
 * 그건 우리 코드가 아니라 React 19 의 리소스 처리이고, 실측해보니 Suspense 가 대기 중인
 * 트리에서는 같은 href 라도 `<head>` 에 둘이 들어간다. 우리 쪽 계약은 "정확한 주소와
 * `precedence` 를 붙여 내보낸다" 까지고, 그건 아래에서 확인한다.
 */
const countLinks = (href: string) =>
  document.querySelectorAll(`link[href="${href}"]`).length;

const expectLinked = (href: string) =>
  waitFor(() => expect(countLinks(href)).toBeGreaterThanOrEqual(1));

describe('로딩 전이', () => {
  it('먼저 스켈레톤을 보여준다', async () => {
    loadRemoteModule.mockReturnValue(new Promise(() => {}));
    const { RemoteComponent } = await load();

    render(<RemoteComponent module="catalog/ProductGrid" />);

    expect(
      screen.getByText(/catalog\/ProductGrid 불러오는 중/),
    ).toBeInTheDocument();
  });

  it('fallbackLabel 을 주면 그걸 쓴다', async () => {
    loadRemoteModule.mockReturnValue(new Promise(() => {}));
    const { RemoteComponent } = await load();

    render(
      <RemoteComponent
        module="catalog/ProductGrid"
        fallbackLabel="상품 불러오는 중"
      />,
    );

    expect(screen.getByText('상품 불러오는 중')).toBeInTheDocument();
  });

  it('도착하면 remote 마크업으로 바뀐다', async () => {
    loadRemoteModule.mockResolvedValue({
      default: () => <p>remote 가 그린 목록</p>,
    });
    const { RemoteComponent } = await load();

    render(<RemoteComponent module="catalog/ProductGrid" />);

    expect(await screen.findByText('remote 가 그린 목록')).toBeInTheDocument();
  });

  it('props 를 remote 컴포넌트에 그대로 넘긴다', async () => {
    loadRemoteModule.mockResolvedValue({
      default: ({ category }: { category?: string }) => <p>{category}</p>,
    });
    const { RemoteComponent } = await load();

    render(
      <RemoteComponent
        module="catalog/ProductGrid"
        props={{ category: 'keyboard' }}
      />,
    );

    expect(await screen.findByText('keyboard')).toBeInTheDocument();
  });

  it('요청한 모듈 id 를 그대로 로더에 넘긴다', async () => {
    loadRemoteModule.mockResolvedValue({ default: () => <p>ok</p> });
    const { RemoteComponent } = await load();

    render(<RemoteComponent module="cart/CartBadge" />);

    await screen.findByText('ok');
    expect(loadRemoteModule).toHaveBeenCalledWith('cart/CartBadge');
  });
});

describe('스타일시트', () => {
  it('remote 오리진 + stylesPath 로 주소를 만든다', async () => {
    // CSS 는 두 로딩 경로 어디로도 따라오지 않는다 — 여기서 한 번 건다.
    loadRemoteModule.mockReturnValue(new Promise(() => {}));
    const { RemoteComponent } = await load();

    render(<RemoteComponent module="catalog/ProductGrid" />);

    await expectLinked(`${ORIGIN}${stylesPath()}`);
  });

  it('버전을 알면 불변 경로를 가리킨다', async () => {
    const { rememberVersion } = await import('./remote-version');
    rememberVersion('catalog', {
      version: 't1abc',
      ssrEntry: `/vt1abc/${MF_FILES.ssrBundle}`,
      webEntry: `/vt1abc/${MF_FILES.webManifest}`,
    });
    loadRemoteModule.mockReturnValue(new Promise(() => {}));
    const { RemoteComponent } = await load();

    render(<RemoteComponent module="catalog/ProductGrid" />);

    await expectLinked(`${ORIGIN}${stylesPath('t1abc')}`);
  });

  it('remote 마다 오리진이 다르다', async () => {
    loadRemoteModule.mockReturnValue(new Promise(() => {}));
    const { RemoteComponent } = await load();

    render(<RemoteComponent module="cart/CartBadge" />);

    await expectLinked(`https://cart.example.com${stylesPath()}`);
  });

  it('head 로 호이스팅된다 — precedence 를 붙인 결과다', async () => {
    /**
     * `precedence` 자체는 DOM 에 남지 않는다(React 가 먹고 처리한다). 관측 가능한 결과는
     * **`<head>` 로 올라갔다**는 것이고, 중복 제거도 그 처리의 일부다.
     */
    loadRemoteModule.mockReturnValue(new Promise(() => {}));
    const { RemoteComponent } = await load();

    render(<RemoteComponent module="catalog/ProductGrid" />);

    const href = `${ORIGIN}${stylesPath()}`;
    await expectLinked(href);
    expect(document.head.querySelector(`link[href="${href}"]`)).not.toBeNull();
  });

  it('Suspense 밖에 있다 — 번들을 기다리는 동안 CSS 요청이 이미 시작된다', async () => {
    // 안에 두면 마크업이 도착한 뒤에야 CSS 를 기다린다.
    loadRemoteModule.mockReturnValue(new Promise(() => {}));
    const { RemoteComponent } = await load();

    render(<RemoteComponent module="catalog/ProductGrid" />);

    // 아직 스켈레톤 상태인데 link 는 이미 있다
    expect(screen.getByText(/불러오는 중/)).toBeInTheDocument();
    await expectLinked(`${ORIGIN}${stylesPath()}`);
  });
});

describe('실패', () => {
  it('로더가 던지면 경계가 받는다 — host 는 살아 있다', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    loadRemoteModule.mockRejectedValue(new Error('ECONNREFUSED'));
    const { RemoteComponent } = await load();

    render(
      <>
        <p>host 는 살아 있다</p>
        <RemoteComponent module="catalog/ProductGrid" />
      </>,
    );

    expect(
      await screen.findByText("remote 'catalog' 를 불러오지 못했습니다"),
    ).toBeInTheDocument();
    expect(screen.getByText('host 는 살아 있다')).toBeInTheDocument();
    error.mockRestore();
  });

  it('경계에 remote 의 web 엔트리를 알려준다', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    loadRemoteModule.mockRejectedValue(new Error('실패'));
    const { RemoteComponent } = await load();

    render(<RemoteComponent module="catalog/ProductGrid" />);

    expect(await screen.findByText(/entry:/)).toHaveTextContent(
      `${ORIGIN}/${MF_FILES.webManifest}`,
    );
    error.mockRestore();
  });
});

describe('remoteCacheKey', () => {
  it('버전을 키에 넣는다', async () => {
    // 안 넣으면 React 의 lazy() 가 옛 컴포넌트를 프로세스 수명 내내 고정한다.
    const { remoteCacheKey } = await load();
    const { rememberVersion } = await import('./remote-version');

    expect(remoteCacheKey('catalog/ProductGrid')).toBe(
      'catalog/ProductGrid@unversioned',
    );

    rememberVersion('catalog', {
      version: 't1abc',
      ssrEntry: `/vt1abc/${MF_FILES.ssrBundle}`,
      webEntry: `/vt1abc/${MF_FILES.webManifest}`,
    });

    expect(remoteCacheKey('catalog/ProductGrid')).toBe(
      'catalog/ProductGrid@t1abc',
    );
  });

  it('reloadKey 가 있으면 뒤에 붙인다', async () => {
    const { remoteCacheKey } = await load();
    expect(remoteCacheKey('catalog/ProductGrid', 'nonce-1')).toBe(
      'catalog/ProductGrid@unversioned#nonce-1',
    );
  });

  it('remote 마다 자기 버전을 본다', async () => {
    const { remoteCacheKey } = await load();
    const { rememberVersion } = await import('./remote-version');
    rememberVersion('cart', {
      version: 't2def',
      ssrEntry: `/vt2def/${MF_FILES.ssrBundle}`,
      webEntry: `/vt2def/${MF_FILES.webManifest}`,
    });

    expect(remoteCacheKey('cart/CartBadge')).toBe('cart/CartBadge@t2def');
    expect(remoteCacheKey('catalog/ProductGrid')).toBe(
      'catalog/ProductGrid@unversioned',
    );
  });

  it('모듈 id 가 다르면 키도 다르다', async () => {
    const { remoteCacheKey } = await load();
    expect(remoteCacheKey('catalog/ProductGrid')).not.toBe(
      remoteCacheKey('catalog/ProductDetail'),
    );
  });
});

describe('lazy 캐시', () => {
  it('같은 모듈 · 같은 버전이면 로더를 한 번만 부른다', async () => {
    // lazy() 를 렌더마다 새로 만들면 remote 상태가 매번 초기화된다.
    loadRemoteModule.mockResolvedValue({ default: () => <p>ok</p> });
    const { RemoteComponent } = await load();

    const { rerender } = render(
      <RemoteComponent module="catalog/ProductGrid" />,
    );
    await screen.findByText('ok');
    rerender(<RemoteComponent module="catalog/ProductGrid" />);

    expect(loadRemoteModule).toHaveBeenCalledTimes(1);
  });

  it('reloadKey 가 바뀌면 로더를 다시 태운다', async () => {
    /**
     * 같은 버전으로 되돌리는 롤백에서는 그 버전의 lazy 엔트리가 이미 캐시에 남아 있어
     * 로더가 호출되지 않는다. 그러면 "무엇을 적재했는지" 가 갱신되지 않아 warm 이
     * 성공을 증명하지 못한다.
     */
    loadRemoteModule.mockResolvedValue({ default: () => <p>ok</p> });
    const { RemoteComponent } = await load();

    const { rerender } = render(
      <RemoteComponent module="catalog/ProductGrid" reloadKey="a" />,
    );
    await screen.findByText('ok');
    rerender(<RemoteComponent module="catalog/ProductGrid" reloadKey="b" />);
    await screen.findByText('ok');

    expect(loadRemoteModule).toHaveBeenCalledTimes(2);
  });

  it('버전이 바뀌면 새 lazy 를 만든다', async () => {
    // React 의 lazy() 는 한 번 resolve 되면 그 결과를 영구히 들고 있다. 버전을 키에
    // 안 넣으면 재배포해도 옛 컴포넌트가 프로세스 수명 내내 고정된다.
    loadRemoteModule.mockResolvedValue({ default: () => <p>ok</p> });
    const { RemoteComponent } = await load();
    const { rememberVersion } = await import('./remote-version');

    const { rerender } = render(
      <RemoteComponent module="catalog/ProductGrid" />,
    );
    await screen.findByText('ok');

    rememberVersion('catalog', {
      version: 't2def',
      ssrEntry: `/vt2def/${MF_FILES.ssrBundle}`,
      webEntry: `/vt2def/${MF_FILES.webManifest}`,
    });
    rerender(
      <RemoteComponent
        module="catalog/ProductGrid"
        props={{ category: 'all' }}
      />,
    );
    await screen.findByText('ok');

    expect(loadRemoteModule).toHaveBeenCalledTimes(2);
  });
});
