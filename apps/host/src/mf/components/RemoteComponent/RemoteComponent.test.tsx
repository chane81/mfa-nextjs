import '@testing-library/jest-dom/vitest';

import { MF_FILES, stylesPath } from '@mfa/remote-config';
import { act, render, screen, waitFor } from '@testing-library/react';
import type { ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { clearGlobalRegistries } from '@mfa/utils/test/globals';

import { REMOTE_VERSIONS_GLOBAL } from '../../versions/browser';

/**
 * 모든 remote 소비가 지나가는 자리. 여기서 보는 것은 넷이다 — 스켈레톤 → remote 마크업
 * 전이, 스타일시트 주소 조립, 실패 시 경계로 떨어지기, 그리고 적재 캐시의 재적재 조건.
 * 키 규칙 자체는 `module-cache.test.ts` 가 DOM 없이 본다.
 *
 * `loader/index.ts` 는 `@module-federation/runtime` 을 초기화하므로 통째로 모킹한다.
 * 여기서 검증할 것은 MF 런타임이 아니라 이 컴포넌트의 조립이다.
 *
 * ## 픽스처 오리진을 `vi.hoisted` 에 두는 이유
 *
 * `vi.mock` 팩토리는 파일 맨 위로 호이스팅되어 **바깥 `const` 를 못 본다.** `vi.hoisted` 에
 * 두면 팩토리와 테스트 본문이 같은 값을 본다.
 *
 * 오리진은 두 자리가 **같은 값이어야** 의미가 있는 픽스처다 — env 스텁과 스타일시트
 * 주소 단언. 한쪽이라도 갈라지면 테스트는 자기들끼리만 맞는 상태로 초록이 된다.
 * 엔트리 주소는 목이 아니라 `config` 가 env 에서 실제로 조립한 값을 쓴다.
 * 로더 목도 같이 둬서 `(id) => loadRemoteModule(id)` 래퍼를 없앴다.
 */
const { CATALOG_ORIGIN, CART_ORIGIN, loadRemoteModule, pinnedEntry } =
  vi.hoisted(() => ({
    CATALOG_ORIGIN: 'https://catalog.example.com',
    CART_ORIGIN: 'https://cart.example.com',
    loadRemoteModule: vi.fn(),
    pinnedEntry: vi.fn(),
  }));

vi.mock('../../loader', () => ({ loadRemoteModule, pinnedEntry }));

beforeEach(() => {
  clearGlobalRegistries();
  vi.resetModules();
  loadRemoteModule.mockReset();
  // 경계가 에러 상자에 찍는 주소는 **런타임이 실제로 부르는 주소**여야 한다.
  pinnedEntry.mockImplementation(
    (remote: string) =>
      `https://${remote}.example.com/vpinned/mf-manifest.json`,
  );
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

const load = () => import('./RemoteComponent');

/**
 * ⚠️ **적재가 끝나는 것을 보는 테스트는 렌더를 `await act` 로 감싼다.**
 *
 * remote 는 `use(promise)` 로 suspend 하는데, RTL 의 `render` 는 **동기** `act` 로
 * 감싼다. 그 스코프 안에서 suspend 된 트리는 promise 가 풀려도 재개되지 않고 React 가
 * "A component suspended inside an `act` scope, but the `act` call was not awaited"
 * 로 경고한다 — 화면은 스켈레톤에 영원히 머물고 `findBy*` 가 제한 시간까지 간다.
 *
 * `await act(async () => …)` 안에서는 마이크로태스크가 비워지고 재개까지 같은 act
 * 스코프에서 끝난다. 스켈레톤 상태만 보는 테스트(로더가 영영 pending)는 그냥 `render`
 * 를 쓴다 — 거기서는 재개할 것이 없고, 동기 렌더가 보려는 상태에 더 가깝다.
 */
const renderDone = async (ui: ReactElement) => {
  let result!: ReturnType<typeof render>;
  await act(async () => {
    result = render(ui);
  });
  return result;
};

/** 같은 이유로 `rerender` 도 감싼다 — 새 promise 가 그 안에서 풀린다. */
const rerenderDone = async (
  rerender: (ui: ReactElement) => void,
  ui: ReactElement,
) => {
  await act(async () => {
    rerender(ui);
  });
};

/**
 * 서버가 인라인 스크립트로 심어주는 값(`RemoteVersionSync`)을 흉내낸다.
 * `vi.stubGlobal` 이라 `unstubGlobals` 설정이 테스트마다 되돌린다.
 */
const stubInjectedVersions = (
  value: Record<string, { version: string; entry: string }>,
) => vi.stubGlobal(REMOTE_VERSIONS_GLOBAL, value);

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

    await renderDone(<RemoteComponent module="catalog/ProductGrid" />);

    expect(await screen.findByText('remote 가 그린 목록')).toBeInTheDocument();
  });

  it('props 를 remote 컴포넌트에 그대로 넘긴다', async () => {
    loadRemoteModule.mockResolvedValue({
      default: ({ category }: { category?: string }) => <p>{category}</p>,
    });
    const { RemoteComponent } = await load();

    await renderDone(
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

    await renderDone(<RemoteComponent module="cart/CartBadge" />);

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

    await expectLinked(`${CATALOG_ORIGIN}${stylesPath()}`);
  });

  it('버전을 알면 불변 경로를 가리킨다', async () => {
    const { rememberVersion } = await import('../../versions/server');
    rememberVersion('catalog', {
      version: 't1abc',
      ssrEntry: `/vt1abc/${MF_FILES.ssrBundle}`,
      webEntry: `/vt1abc/${MF_FILES.webManifest}`,
    });
    loadRemoteModule.mockReturnValue(new Promise(() => {}));
    const { RemoteComponent } = await load();

    render(<RemoteComponent module="catalog/ProductGrid" />);

    await expectLinked(`${CATALOG_ORIGIN}${stylesPath('t1abc')}`);
  });

  it('브라우저에서는 서버가 심어준 버전을 본다', async () => {
    /**
     * ⚠️ 이 테스트가 이 파일에서 제일 중요하다.
     *
     * 서버가 조회한 버전(`rememberVersion` → `globalCell`)은 **서버 프로세스에만** 있다.
     * 브라우저 렌더가 그걸 읽으려 하면 늘 비어 있어서 `/style.css` — 배포본에 없는
     * 주소 — 로 요청이 나갔다. 여기서는 `globalCell` 을 일부러 비워 두고, 심어준 값만으로
     * 불변 경로가 나오는지 본다.
     */
    stubInjectedVersions({
      catalog: {
        version: 't9zzz',
        entry: `${CATALOG_ORIGIN}/vt9zzz/${MF_FILES.webManifest}`,
      },
    });
    loadRemoteModule.mockReturnValue(new Promise(() => {}));
    const { RemoteComponent } = await load();

    render(<RemoteComponent module="catalog/ProductGrid" />);

    await expectLinked(`${CATALOG_ORIGIN}${stylesPath('t9zzz')}`);
  });

  it('remote 마다 오리진이 다르다', async () => {
    loadRemoteModule.mockReturnValue(new Promise(() => {}));
    const { RemoteComponent } = await load();

    render(<RemoteComponent module="cart/CartBadge" />);

    await expectLinked(`${CART_ORIGIN}${stylesPath()}`);
  });

  it('head 로 호이스팅된다 — precedence 를 붙인 결과다', async () => {
    /**
     * `precedence` 자체는 DOM 에 남지 않는다(React 가 먹고 처리한다). 관측 가능한 결과는
     * **`<head>` 로 올라갔다**는 것이고, 중복 제거도 그 처리의 일부다.
     */
    loadRemoteModule.mockReturnValue(new Promise(() => {}));
    const { RemoteComponent } = await load();

    render(<RemoteComponent module="catalog/ProductGrid" />);

    const href = `${CATALOG_ORIGIN}${stylesPath()}`;
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
    await expectLinked(`${CATALOG_ORIGIN}${stylesPath()}`);
  });
});

describe('실패', () => {
  it('로더가 던지면 경계가 받는다 — host 는 살아 있다', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    loadRemoteModule.mockRejectedValue(new Error('ECONNREFUSED'));
    const { RemoteComponent } = await load();

    await renderDone(
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

  it('경계에 런타임이 실제로 쓰는 엔트리가 찍힌다', async () => {
    // 폴백(`WEB_ENTRIES`)은 dev 에만 실재하는 주소다. 그걸 찍으면 배포 장애에서
    // 진단이 거짓말을 한다 — 실패한 URL 이 화면 어디에도 안 나온다.
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    loadRemoteModule.mockRejectedValue(new Error('실패'));
    const { RemoteComponent } = await load();

    await renderDone(<RemoteComponent module="catalog/ProductGrid" />);

    const detail = await screen.findByText(/entry:/);
    expect(detail).toHaveTextContent(
      'https://catalog.example.com/vpinned/mf-manifest.json',
    );
    expect(detail).not.toHaveTextContent(
      `${CATALOG_ORIGIN}/${MF_FILES.webManifest}\n`,
    );
    error.mockRestore();
  });
});

describe('적재 캐시', () => {
  it('같은 모듈 · 같은 버전이면 로더를 한 번만 부른다', async () => {
    // 적재 promise 를 렌더마다 새로 만들면 remote 상태가 매번 초기화된다.
    loadRemoteModule.mockResolvedValue({ default: () => <p>ok</p> });
    const { RemoteComponent } = await load();

    const { rerender } = await renderDone(
      <RemoteComponent module="catalog/ProductGrid" />,
    );
    await screen.findByText('ok');
    await rerenderDone(
      rerender,
      <RemoteComponent module="catalog/ProductGrid" />,
    );

    expect(loadRemoteModule).toHaveBeenCalledTimes(1);
  });

  it('reloadKey 가 바뀌면 로더를 다시 태운다', async () => {
    /**
     * 같은 버전으로 되돌리는 롤백에서는 그 버전의 promise 가 이미 캐시에 남아 있어
     * 로더가 호출되지 않는다. 그러면 "무엇을 적재했는지" 가 갱신되지 않아 warm 이
     * 성공을 증명하지 못한다.
     */
    loadRemoteModule.mockResolvedValue({ default: () => <p>ok</p> });
    const { RemoteComponent } = await load();

    const { rerender } = await renderDone(
      <RemoteComponent module="catalog/ProductGrid" reloadKey="a" />,
    );
    await screen.findByText('ok');
    await rerenderDone(
      rerender,
      <RemoteComponent module="catalog/ProductGrid" reloadKey="b" />,
    );
    await screen.findByText('ok');

    expect(loadRemoteModule).toHaveBeenCalledTimes(2);
  });

  it('버전이 바뀌면 새로 적재한다', async () => {
    // 한 번 resolve 된 promise 는 그 결과를 영구히 들고 있다. 버전을 키에
    // 안 넣으면 재배포해도 옛 모듈이 프로세스 수명 내내 고정된다.
    loadRemoteModule.mockResolvedValue({ default: () => <p>ok</p> });
    const { RemoteComponent } = await load();
    const { rememberVersion } = await import('../../versions/server');

    const { rerender } = await renderDone(
      <RemoteComponent module="catalog/ProductGrid" />,
    );
    await screen.findByText('ok');

    rememberVersion('catalog', {
      version: 't2def',
      ssrEntry: `/vt2def/${MF_FILES.ssrBundle}`,
      webEntry: `/vt2def/${MF_FILES.webManifest}`,
    });
    await rerenderDone(
      rerender,
      <RemoteComponent
        module="catalog/ProductGrid"
        props={{ category: 'all' }}
      />,
    );
    await screen.findByText('ok');

    expect(loadRemoteModule).toHaveBeenCalledTimes(2);
  });
});
