import '@testing-library/jest-dom/vitest';

import { REMOTE_NAMES } from '@mfa/contracts';
import { MF_FILES, versionedPath } from '@mfa/remote-config';
import { render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * remote 가 안 뜰 때 원인을 좁히는 진단 화면.
 *
 * **진단이 거짓말을 하면 없는 장애를 쫓게 된다.** 한동안 여기만 폴백 엔트리를 찔러서,
 * 배포에서 두 remote 가 멀쩡한데도 `Failed to fetch` 로 빨갛게 떴다. 그래서 이 파일이
 * 지키는 첫 번째 계약은 "MF 런타임이 실제로 쓰는 URL(`pinnedEntry`)을 찌른다" 이다.
 *
 * 그래서 폴백 주소와 핀 주소가 **같은 오리진에서 갈라져 나와야** 그 구분이 진짜 구분이 된다.
 * 오리진을 리터럴로 각각 적으면 한쪽만 고쳐도 테스트는 초록인 채로 의미를 잃는다.
 * `vi.mock` 팩토리는 호이스팅되어 바깥 `const` 를 못 보므로 오리진과 목을 `vi.hoisted` 에 둔다.
 */
const { CATALOG_ORIGIN, CART_ORIGIN, pinnedEntry, pinnedVersion } = vi.hoisted(
  () => ({
    CATALOG_ORIGIN: 'https://catalog.example.com',
    CART_ORIGIN: 'https://cart.example.com',
    pinnedEntry: vi.fn(),
    pinnedVersion: vi.fn(),
  }),
);

/** 버전 핀이 없을 때 쓰이는 주소. 이걸 찌르면 진단이 거짓말을 한 것이다. */
const FALLBACK = {
  catalog: `${CATALOG_ORIGIN}/${MF_FILES.webManifest}`,
  cart: `${CART_ORIGIN}/${MF_FILES.webManifest}`,
} as const;

vi.mock('@/mf/runtime', () => ({
  pinnedEntry,
  pinnedVersion,
  REMOTE_ENTRIES: FALLBACK,
}));

/** MF 런타임이 실제로 쓰는 주소. 경로 조립은 `versionedPath` 가 한다. */
const PINNED = {
  catalog: `${CATALOG_ORIGIN}${versionedPath(MF_FILES.webManifest, 't1abc')}`,
  cart: `${CART_ORIGIN}${versionedPath(MF_FILES.webManifest, 't2def')}`,
} as const;

beforeEach(() => {
  vi.resetModules();
  pinnedEntry.mockImplementation(
    (remote: 'catalog' | 'cart') => PINNED[remote],
  );
  pinnedVersion.mockReturnValue(null);
});

const ok = (exposes: string[]) =>
  ({
    ok: true,
    status: 200,
    json: async () => ({ exposes: exposes.map((name) => ({ name })) }),
  }) as Response;

const load = async () => (await import('./MfDiagnostics')).MfDiagnostics;

const row = (remote: string) =>
  within(screen.getByRole('table'))
    .getAllByRole('row')
    .find((r) => within(r).queryByText(remote))!;

/**
 * ⚠️ 상세 칸은 **버전 핀 문구 + detail** 두 노드로 쪼개져 있다. `getByText` 는 노드 하나를
 * 찾으므로 "exposes: …" 같은 문자열을 통째로 못 집는다 — 줄 전체의 `textContent` 를 본다.
 */
const expectDetail = (remote: string, text: string) =>
  waitFor(() => expect(row(remote).textContent).toContain(text));

describe('MfDiagnostics', () => {
  it('remote 마다 한 줄씩 낸다', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ok(['./ProductGrid'])),
    );
    const MfDiagnostics = await load();

    render(<MfDiagnostics />);

    for (const remote of REMOTE_NAMES) {
      expect(row(remote)).toBeDefined();
    }
  });

  it('MF 런타임이 쓰는 URL 을 그대로 찌른다', async () => {
    // 여기가 갈리면 진단이 거짓말을 한다.
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) =>
      ok([]),
    );
    vi.stubGlobal('fetch', fetchMock);
    const MfDiagnostics = await load();

    render(<MfDiagnostics />);

    await expectDetail('catalog', 'exposes:');
    expect(fetchMock.mock.calls.map(([url]) => url).sort()).toEqual(
      [PINNED.catalog, PINNED.cart].sort(),
    );
  });

  it('캐시하지 않고 찌른다', async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) =>
      ok([]),
    );
    vi.stubGlobal('fetch', fetchMock);
    const MfDiagnostics = await load();

    render(<MfDiagnostics />);

    await expectDetail('catalog', 'exposes:');
    expect(fetchMock.mock.calls[0]![1]).toMatchObject({ cache: 'no-store' });
  });

  it('첫 렌더는 폴백 엔트리와 pending 이다 — 하이드레이션이 갈리지 않게', async () => {
    // 서버가 심는 값은 하이드레이션 이후에나 보인다. 렌더 시점에 읽으면 마크업이 갈린다.
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise(() => {})),
    );
    const MfDiagnostics = await load();

    render(<MfDiagnostics />);

    expect(screen.getAllByText('pending')).toHaveLength(REMOTE_NAMES.length);
    expect(screen.getByText(FALLBACK.catalog)).toBeInTheDocument();
  });

  it('성공하면 exposes 목록을 보여준다', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ok(['./ProductGrid', './ProductDetail'])),
    );
    const MfDiagnostics = await load();

    render(<MfDiagnostics />);

    await expectDetail('catalog', 'exposes: ./ProductGrid, ./ProductDetail');
  });

  it('매니페스트에 exposes 가 없으면 그렇게 말한다', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          ({ ok: true, status: 200, json: async () => ({}) }) as Response,
      ),
    );
    const MfDiagnostics = await load();

    render(<MfDiagnostics />);

    for (const remote of REMOTE_NAMES) {
      await expectDetail(remote, '(manifest 에 exposes 정보 없음)');
    }
  });

  it('상태 코드 실패는 코드를 보여준다', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 404 }) as Response),
    );
    const MfDiagnostics = await load();

    render(<MfDiagnostics />);

    for (const remote of REMOTE_NAMES) await expectDetail(remote, 'HTTP 404');
    expect(screen.getAllByText('fail')).toHaveLength(REMOTE_NAMES.length);
  });

  it('네트워크 실패는 메시지를 그대로 보여준다', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('Failed to fetch');
      }),
    );
    const MfDiagnostics = await load();

    render(<MfDiagnostics />);

    for (const remote of REMOTE_NAMES) {
      await expectDetail(remote, 'Failed to fetch');
    }
  });

  it('버전 핀이 있으면 그 값을, 없으면 폴백임을 밝힌다', async () => {
    // 배포에서 "버전 핀 없음" 인데 404 면 remote 가 mf-version.json 을 공표하지 못한 것이다.
    pinnedVersion.mockImplementation((remote: string) =>
      remote === 'catalog' ? 't1abc' : null,
    );
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ok([])),
    );
    const MfDiagnostics = await load();

    render(<MfDiagnostics />);

    await expectDetail('catalog', '버전 핀 t1abc');
    await expectDetail('cart', '버전 핀 없음(폴백 엔트리)');
  });

  it('언마운트 후에는 상태를 건드리지 않는다', async () => {
    let settle: (value: Response) => void = () => {};
    vi.stubGlobal(
      'fetch',
      vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            settle = resolve;
          }),
      ),
    );
    const MfDiagnostics = await load();

    const { unmount } = render(<MfDiagnostics />);
    unmount();
    settle(ok([]));

    // cancelled 가드가 없으면 여기서 React 가 경고를 낸다.
    await expect(Promise.resolve()).resolves.toBeUndefined();
  });
});
