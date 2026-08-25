import { MF_FILES, versionedPath } from '@mfa/remote-config';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { clearGlobalRegistries } from '@tests/helpers/globals';

/**
 * remote 배포 파이프라인이 host 캐시를 깨우는 엔드포인트.
 *
 * 여기서 지키는 건 **순서**다 — warm-then-revalidate. 무효화를 먼저 하면 재생성 렌더가
 * remote 번들을 받는 동안 Suspense fallback 상태로 캐시에 굳어, 스켈레톤이 HIT 로 계속
 * 서빙된다.
 */
vi.mock('next/cache', () => ({
  revalidateTag: vi.fn(),
  revalidatePath: vi.fn(),
}));

const ORIGIN = 'https://catalog.example.com';
const SECRET = 's3cret';
const VERSION = 't1abc';

beforeEach(() => {
  clearGlobalRegistries();
  vi.resetModules();
  // `vi.mock` 팩토리로 만든 mock 은 `resetModules()` 로 초기화되지 않는다 —
  // 호출 기록이 파일 전체에 걸쳐 쌓여서 "몇 번 불렸나" 단언이 전부 무의미해진다.
  vi.clearAllMocks();
  vi.stubEnv('MF_REVALIDATE_SECRET', SECRET);
  vi.stubEnv('REMOTE_CATALOG_PUBLIC_URL', ORIGIN);
  vi.stubEnv('REMOTE_CART_PUBLIC_URL', 'https://cart.example.com');
  vi.stubEnv('MF_SELF_ORIGIN', undefined);
  vi.stubEnv('PORT', undefined);
  vi.stubEnv('NODE_ENV', 'test');
});

const manifest = (version = VERSION) => ({
  version,
  ssrEntry: versionedPath(MF_FILES.ssrBundle, version),
  webEntry: versionedPath(MF_FILES.webManifest, version),
});

const request = (
  query = '',
  init: { secret?: string | null; body?: unknown } = {},
) =>
  new Request(`https://host.example.com/api/mf-revalidate${query}`, {
    method: 'POST',
    headers:
      init.secret === null ? {} : { 'x-mf-secret': init.secret ?? SECRET },
    body: JSON.stringify(init.body ?? { remote: 'catalog' }),
  });

interface WorldOptions {
  /** 버전 매니페스트 조회 결과. null 이면 remote 가 안 뜬 것 */
  version?: ReturnType<typeof manifest> | null;
  /** warm 요청 응답 */
  warm?: { ok: boolean; status?: number } | 'throw';
  /** warm 이 실제로 번들을 적재했는지 */
  warmLoadsBundle?: boolean;
}

/**
 * 이 라우트가 실제로 만지는 바깥 세계를 통째로 세운다 — 버전 매니페스트와 자기호출 warm.
 * warm 이 성공하면 SSR 레이어가 번들을 적재하므로, 그 부수효과까지 흉내내야
 * `isBundleReady` 판정이 현실과 같아진다.
 */
const world = async (options: WorldOptions = {}) => {
  const {
    version = manifest(),
    warm = { ok: true },
    warmLoadsBundle = true,
  } = options;

  const remoteVersion = await import('@/mf/remote-version');

  const fetchMock = vi.fn(async (input: string | URL, _init?: RequestInit) => {
    const url = String(input);

    if (url.endsWith(MF_FILES.versionManifest)) {
      return version
        ? ({ ok: true, json: async () => version } as Response)
        : ({ ok: false } as Response);
    }

    if (url.includes('/internal/mf-warm')) {
      if (warm === 'throw') {
        throw new TypeError('fetch failed', {
          cause: new Error('connect ECONNREFUSED 127.0.0.1:3000'),
        });
      }
      if (warmLoadsBundle && version) {
        // warm 렌더가 remote 번들을 적재한 자리
        remoteVersion.markBundleReady(
          'catalog',
          version.version,
          remoteVersion.warmEpoch(),
        );
      }
      return {
        ok: warm.ok,
        status: warm.status ?? (warm.ok ? 200 : 500),
        text: async () => '',
      } as Response;
    }

    throw new Error(`예상 밖 요청: ${url}`);
  });

  vi.stubGlobal('fetch', fetchMock);

  const cache = await import('next/cache');
  const { POST } = await import('./route');
  return {
    POST,
    fetchMock,
    revalidateTag: vi.mocked(cache.revalidateTag),
    revalidatePath: vi.mocked(cache.revalidatePath),
    remoteVersion,
  };
};

describe('selfOrigin', () => {
  const selfOrigin = async () => (await import('./route')).selfOrigin();

  it('MF_SELF_ORIGIN 이 가장 우선이다', async () => {
    vi.stubEnv('MF_SELF_ORIGIN', 'http://other-instance:3000');
    vi.stubEnv('PORT', '8080');
    expect(await selfOrigin()).toBe('http://other-instance:3000');
  });

  it('없으면 PORT 로 루프백을 만든다', async () => {
    // 공개 도메인으로 부르면 리버스 프록시를 한 바퀴 돌아 자기에게 돌아온다.
    vi.stubEnv('PORT', '8080');
    expect(await selfOrigin()).toBe('http://127.0.0.1:8080');
  });

  it('PORT 도 없으면 3000 이다', async () => {
    expect(await selfOrigin()).toBe('http://127.0.0.1:3000');
  });

  it('빈 문자열은 미설정으로 본다', async () => {
    vi.stubEnv('MF_SELF_ORIGIN', '');
    vi.stubEnv('PORT', '');
    expect(await selfOrigin()).toBe('http://127.0.0.1:3000');
  });
});

describe('인증', () => {
  it('시크릿이 없으면 401 이다', async () => {
    const { POST, revalidateTag } = await world();

    const res = await POST(request('', { secret: null }));

    expect(res.status).toBe(401);
    // 인증 전에는 아무것도 건드리지 않는다.
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it('시크릿이 틀리면 401 이다', async () => {
    const { POST } = await world();
    expect((await POST(request('', { secret: 'wrong-secret' }))).status).toBe(
      401,
    );
  });
});

describe('입력 검증', () => {
  it('remote 가 없으면 400 이다', async () => {
    const { POST, revalidateTag } = await world();

    const res = await POST(request('', { body: {} }));

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({
      error: expect.stringContaining('catalog'),
    });
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it('모르는 remote 는 400 이다', async () => {
    const { POST } = await world();
    expect(
      (await POST(request('', { body: { remote: 'checkout' } }))).status,
    ).toBe(400);
  });

  it('본문이 JSON 이 아니어도 400 으로 끝난다', async () => {
    const { POST } = await world();
    const res = await POST(
      new Request('https://host.example.com/api/mf-revalidate', {
        method: 'POST',
        headers: { 'x-mf-secret': SECRET },
        body: '깨진 JSON',
      }),
    );
    expect(res.status).toBe(400);
  });
});

describe('성공 경로 — warm-then-revalidate', () => {
  it('버전·번들 태그를 먼저 깨고, warm 이 끝난 뒤에 페이지 태그를 깬다', async () => {
    const { POST, fetchMock, revalidateTag } = await world();
    const { remoteVersionTag } = await import('@/mf/remote-version');
    const { remoteBundleTag, remoteCacheTag } = await import(
      '@/mf/server-loader'
    );

    await POST(request());

    expect(revalidateTag.mock.calls).toEqual([
      [remoteVersionTag('catalog'), { expire: 0 }],
      [remoteBundleTag('catalog'), { expire: 0 }],
      [remoteCacheTag('catalog'), 'max'],
    ]);

    // 페이지 태그는 warm fetch 뒤에 깬다 — 이게 이 라우트의 존재 이유다.
    const warmCall = fetchMock.mock.invocationCallOrder.at(-1)!;
    expect(revalidateTag.mock.invocationCallOrder[2]!).toBeGreaterThan(
      warmCall,
    );
  });

  it('앞의 두 태그는 즉시 만료여야 한다', async () => {
    // "max" 는 stale-while-revalidate 라 다음 fetch 가 옛 값을 그대로 돌려준다.
    // 그러면 warm 이 옛 remote 코드를 데우고, remote 가 죽어 있어도 "성공" 해버린다.
    const { POST, revalidateTag } = await world();

    await POST(request());

    expect(revalidateTag.mock.calls[0]![1]).toEqual({ expire: 0 });
    expect(revalidateTag.mock.calls[1]![1]).toEqual({ expire: 0 });
  });

  it('warm 은 루프백으로 자기 자신을 부른다', async () => {
    // 공개 도메인으로 부르면 리버스 프록시를 한 바퀴 돌아 자기에게 돌아오고,
    // 배포 환경(Dokploy + Traefik)에서 그 자기호출이 fetch failed 로 죽었다.
    const { POST, fetchMock } = await world();

    await POST(request());

    const warmUrl = new URL(String(fetchMock.mock.calls.at(-1)![0]));
    expect(warmUrl.origin).toBe('http://127.0.0.1:3000');
    expect(warmUrl.pathname).toBe('/internal/mf-warm');
  });

  it('warm 요청에 remote · version · nonce 를 싣는다', async () => {
    // nonce 가 lazy 캐시를 우회해 로더를 반드시 태운다 (롤백 대응).
    const { POST, fetchMock } = await world();

    await POST(request());

    const params = new URL(String(fetchMock.mock.calls.at(-1)![0]))
      .searchParams;
    expect(params.get('remote')).toBe('catalog');
    expect(params.get('version')).toBe(VERSION);
    expect(params.get('nonce')).toMatch(new RegExp(`^${VERSION}-\\d+$`));
  });

  it('warm 요청에도 같은 시크릿을 전달한다', async () => {
    // /internal/mf-warm 도 proxy 가 막고 있다.
    const { POST, fetchMock } = await world();

    await POST(request());

    expect(fetchMock.mock.calls.at(-1)![1]).toMatchObject({
      cache: 'no-store',
      headers: { 'x-mf-secret': SECRET },
    });
  });

  it('MF_SELF_ORIGIN 이 있으면 그쪽을 부른다', async () => {
    vi.stubEnv('MF_SELF_ORIGIN', 'http://other-instance:3000');
    const { POST, fetchMock } = await world();

    await POST(request());

    expect(String(fetchMock.mock.calls.at(-1)![0])).toContain(
      'http://other-instance:3000',
    );
  });

  it('PORT 가 있으면 그 포트로 자기를 부른다', async () => {
    vi.stubEnv('PORT', '8080');
    const { POST, fetchMock } = await world();

    await POST(request());

    expect(String(fetchMock.mock.calls.at(-1)![0])).toContain('127.0.0.1:8080');
  });

  it('응답에 결과 요약을 담는다', async () => {
    const { POST } = await world();
    const { remoteCacheTag } = await import('@/mf/server-loader');

    const body = await (await POST(request())).json();

    expect(body).toEqual({
      ok: true,
      remote: 'catalog',
      version: VERSION,
      warmed: 'ok',
      tag: remoteCacheTag('catalog'),
      revalidated: [],
    });
  });

  it('?paths=1 이면 정적 라우트도 같이 깬다', async () => {
    // 캐시 스코프 없이 통째로 프리렌더된 라우트는 cacheTag 가 없어 태그로 못 깬다.
    const { POST, revalidatePath } = await world();

    const body = await (await POST(request('?paths=1'))).json();

    expect(revalidatePath).toHaveBeenCalledTimes(4);
    expect(revalidatePath.mock.calls.map((c) => c[0])).toEqual([
      '/',
      '/lab/isr',
      '/lab/cache',
      '/products/[id]',
    ]);
    expect(body.revalidated).toHaveLength(4);
  });

  it('기본값에서는 revalidatePath 를 부르지 않는다', async () => {
    const { POST, revalidatePath } = await world();
    await POST(request());
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

describe('?warm=0', () => {
  it('remote 에 닿지 않고 태그만 깬다', async () => {
    const { POST, fetchMock, revalidateTag } = await world();

    const body = await (await POST(request('?warm=0'))).json();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(revalidateTag).toHaveBeenCalledTimes(3);
    expect(body.warmed).toBe('skipped');
  });

  it('버전을 모르는 상태에서도 성공한다', async () => {
    const { POST } = await world();
    const body = await (await POST(request('?warm=0'))).json();
    expect(body).toMatchObject({ ok: true, version: null });
  });
});

describe('중단 — 페이지 캐시를 건드리지 않는다', () => {
  it('버전 매니페스트를 못 읽으면 502 다', async () => {
    const { POST, revalidateTag } = await world({ version: null });
    const { remoteCacheTag } = await import('@/mf/server-loader');

    const res = await POST(request());

    expect(res.status).toBe(502);
    expect(await res.json()).toMatchObject({
      detail: expect.stringContaining('버전 매니페스트를 읽지 못했습니다'),
    });
    // 앞의 두 태그는 이미 깼지만 페이지 태그는 그대로다 — 옛 캐시가 스켈레톤보다 낫다.
    expect(revalidateTag).toHaveBeenCalledTimes(2);
    expect(revalidateTag).not.toHaveBeenCalledWith(
      remoteCacheTag('catalog'),
      'max',
    );
  });

  it('warm 이 상태 코드로 실패하면 502 다', async () => {
    const { POST, revalidateTag } = await world({
      warm: { ok: false, status: 503 },
      warmLoadsBundle: false,
    });

    const res = await POST(request());

    expect(res.status).toBe(502);
    expect((await res.json()).detail).toContain('warm 응답 503');
    expect(revalidateTag).toHaveBeenCalledTimes(2);
  });

  it('warm 연결이 실패하면 cause 를 풀어서 보여준다', async () => {
    // undici 는 모든 하위 에러를 `TypeError: fetch failed` 로 감싸고 원인은 cause 에만 남긴다.
    const { POST } = await world({ warm: 'throw' });

    const detail = (await (await POST(request())).json()).detail as string;

    expect(detail).toContain('fetch failed');
    expect(detail).toContain('ECONNREFUSED');
    expect(detail).toContain('http://127.0.0.1:3000');
  });

  it('warm 이 200 이어도 그 버전을 적재하지 못했으면 502 다', async () => {
    // warm 페이지의 remote 는 RemoteBoundary 안이라 remote 가 죽어도 200 이 나온다.
    // 그래서 성공 판정은 HTTP 상태가 아니라 적재된 버전으로 한다.
    const { POST, revalidateTag } = await world({ warmLoadsBundle: false });

    const res = await POST(request());

    expect(res.status).toBe(502);
    expect((await res.json()).detail).toMatch(
      /적재하지 못했습니다.*무결성·서명/s,
    );
    expect(revalidateTag).toHaveBeenCalledTimes(2);
  });

  it('중단 응답에 공표·적재 버전을 같이 담는다', async () => {
    const { POST } = await world({ warmLoadsBundle: false });

    const body = await (await POST(request())).json();

    expect(body).toMatchObject({
      remote: 'catalog',
      version: VERSION,
      ready: null,
    });
  });

  it('예전 세대에 적재해 둔 것을 성공으로 오인하지 않는다', async () => {
    // 버전만 비교하면 이 구멍으로 변조된 배포가 웹훅 200 을 받아낸다.
    const remoteVersion = await import('@/mf/remote-version');
    remoteVersion.markBundleReady(
      'catalog',
      VERSION,
      remoteVersion.warmEpoch(),
    );

    const { POST } = await world({ warmLoadsBundle: false });
    const { bumpWarmEpoch } = await import('@/mf/remote-version');
    bumpWarmEpoch();

    expect((await POST(request())).status).toBe(502);
  });
});
