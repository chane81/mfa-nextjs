import { MF_FILES, versionedPath } from '@mfa/remote-config';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { clearGlobalRegistries } from '@tests/helpers/globals';

/**
 * 실험 절차: `DELETE` 로 0 으로 리셋 → 대상 페이지를 N 번 요청 → `GET` 으로 확인.
 * 캐시가 동작하면 HIT 구간의 요청은 fetch 도 eval 도 0 이어야 한다.
 */
const ORIGIN = 'https://catalog.example.com';

/**
 * `revalidateTag` 는 Next 런타임 밖에서는 못 돈다. 여기서 보는 건 무효화가 실제로
 * 일어났는지가 아니라 **언제 부르는지**다 — 버전이 바뀐 remote 만, 바뀐 만큼.
 */
const { revalidateTag } = vi.hoisted(() => ({ revalidateTag: vi.fn() }));
vi.mock('next/cache', () => ({ revalidateTag }));

beforeEach(() => {
  clearGlobalRegistries();
  vi.resetModules();
  revalidateTag.mockClear();
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
  const stats = await import('@/mf/state/loader-stats');
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

  it('버전이 바뀌면 그 remote 의 버전 태그를 즉시 만료시킨다', async () => {
    /**
     * 조회만 하고 태그를 안 깨면 `globalCell` 은 새 버전인데 `RemoteVersionSync` 의
     * `"use cache"` 스크립트는 옛 버전을 계속 낸다. 그러면 서버가 만든 `<link>` 와
     * 브라우저가 만드는 `<link>` 가 갈려 스타일시트를 한 번 더 요청한다
     * (옛 자산이 정리됐으면 404 — known-issues G-1 과 같은 얼굴이다).
     */
    const { GET } = await setup();

    await GET(get('?refresh=1'));

    expect(revalidateTag.mock.calls).toEqual([
      ['mf-remote-version:catalog', { expire: 0 }],
      ['mf-remote-version:cart', { expire: 0 }],
    ]);
  });

  it('버전이 그대로면 태그를 깨지 않는다', async () => {
    // 안 그러면 조회할 때마다 캐시가 날아가 실험 자체가 캐시를 못 본다.
    const { GET } = await setup();
    await GET(get('?refresh=1'));
    revalidateTag.mockClear();

    await GET(get('?refresh=1'));

    expect(revalidateTag).not.toHaveBeenCalled();
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

    const body = await DELETE().json();

    expect(body).toEqual({
      ok: true,
      stats: { fetches: 0, evals: 0, byRemote: {}, loads: {} },
    });
    expect((await (await GET(get())).json()).stats.fetches).toBe(0);
  });

  it('프로덕션에서는 404 다 — 무인증 변경 동작을 남겨두지 않는다', async () => {
    // proxy 가 이미 렌더 앞에서 자른다. 여기 검사는 matcher 가 틀어졌을 때의 이중 방어라
    // proxy 를 거치지 않는 이 단위 테스트에서 따로 확인한다.
    const { DELETE, recordFetch, GET } = await setup();
    recordFetch('catalog');
    vi.stubEnv('NODE_ENV', 'production');

    const res = DELETE();

    expect(res.status).toBe(404);
    expect((await (await GET(get())).json()).stats.fetches).toBe(1);
  });

  it('버전 정보는 지우지 않는다 — 리셋 대상은 계측뿐이다', async () => {
    const { DELETE, GET } = await setup();
    await GET(get('?refresh=1'));

    DELETE();

    expect((await (await GET(get())).json()).versions).toEqual({
      catalog: 't1cat',
      cart: 't2cart',
    });
  });
});
