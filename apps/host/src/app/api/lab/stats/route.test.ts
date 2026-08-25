import { MF_FILES, versionedPath } from '@mfa/remote-config';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { clearGlobalRegistries } from '@tests/helpers/globals';

/**
 * 실험 절차: `DELETE` 로 0 으로 리셋 → 대상 페이지를 N 번 요청 → `GET` 으로 확인.
 * 캐시가 동작하면 HIT 구간의 요청은 fetch 도 eval 도 0 이어야 한다.
 */
const ORIGIN = 'https://catalog.example.com';

beforeEach(() => {
  clearGlobalRegistries();
  vi.resetModules();
  vi.stubEnv('REMOTE_CATALOG_PUBLIC_URL', ORIGIN);
  vi.stubEnv('REMOTE_CART_PUBLIC_URL', 'https://cart.example.com');
  vi.stubEnv('NODE_ENV', 'test');
});

const manifest = (version: string) => ({
  version,
  ssrEntry: versionedPath(MF_FILES.ssrBundle, version),
  webEntry: versionedPath(MF_FILES.webManifest, version),
});

const setup = async () => {
  const fetchMock = vi.fn(async (input: string | URL) => {
    const url = String(input);
    const version = url.includes('cart') ? 't2cart' : 't1cat';
    return { ok: true, json: async () => manifest(version) } as Response;
  });
  vi.stubGlobal('fetch', fetchMock);

  const route = await import('./route');
  const stats = await import('@/mf/loader-stats');
  return { ...route, fetchMock, ...stats };
};

const get = (query = '') =>
  new Request(`https://host.example.com/api/lab/stats${query}`);

describe('GET', () => {
  it('기본값에서는 remote 를 부르지 않는다', async () => {
    const { GET, fetchMock } = await setup();

    await GET(get());

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('?refresh=1 이면 모든 remote 를 다시 읽는다', async () => {
    // 멀티 인스턴스 수렴 확인용 — 웹훅을 못 받은 인스턴스도 따라와야 한다.
    const { GET, fetchMock } = await setup();

    const body = await (await GET(get('?refresh=1'))).json();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(body.versions).toEqual({ catalog: 't1cat', cart: 't2cart' });
  });

  it('응답에 네 축을 담는다', async () => {
    const { GET, recordFetch } = await setup();
    recordFetch('catalog');

    const body = await (await GET(get())).json();

    expect(Object.keys(body).sort()).toEqual([
      'at',
      'entries',
      'stats',
      'versions',
    ]);
    expect(body.stats).toMatchObject({ fetches: 1, byRemote: { catalog: 1 } });
    expect(body.entries.catalog).toBe(`${ORIGIN}/${MF_FILES.ssrBundle}`);
  });

  it('at 은 읽는 쪽이 찍는 시각이다', async () => {
    // 카운터에는 시간을 담지 않는다 — prerender 중 Date.now() 는 동적 IO 로 취급돼
    // 캐시 경계를 깨뜨릴 수 있다. 시각은 여기서 찍는다.
    const { GET } = await setup();
    const body = await (await GET(get())).json();
    expect(() => new Date(body.at).toISOString()).not.toThrow();
  });

  it('버전을 알면 entries 가 불변 경로를 가리킨다', async () => {
    const { GET } = await setup();

    await GET(get('?refresh=1'));
    const body = await (await GET(get())).json();

    expect(body.entries.catalog).toBe(`${ORIGIN}/vt1cat/${MF_FILES.ssrBundle}`);
  });
});

describe('DELETE', () => {
  it('카운터를 0 으로 되돌리고 그 결과를 돌려준다', async () => {
    const { DELETE, GET, recordFetch, recordEval } = await setup();
    recordFetch('catalog');
    recordEval();

    const body = await (await DELETE()).json();

    expect(body).toEqual({
      ok: true,
      stats: { fetches: 0, evals: 0, byRemote: {}, loads: {} },
    });
    expect((await (await GET(get())).json()).stats.fetches).toBe(0);
  });

  it('버전 정보는 지우지 않는다 — 리셋 대상은 계측뿐이다', async () => {
    const { DELETE, GET } = await setup();
    await GET(get('?refresh=1'));

    await DELETE();

    expect((await (await GET(get())).json()).versions).toEqual({
      catalog: 't1cat',
      cart: 't2cart',
    });
  });
});
