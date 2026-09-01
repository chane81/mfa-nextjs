import { MF_FILES, versionedPath } from '@mfa/remote-config';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { clearGlobalRegistries } from '@tests/helpers/globals';
import { generateSigningKeyPair, signPayload } from '@tests/helpers/signing';

/**
 * 이 모듈은 `globalCell` 세 개를 **모듈 스코프에 캐시**하고, 전이 의존하는
 * `remote-endpoints` 는 import 시점에 env 를 굽는다. 그래서 매번 레지스트리를 비우고
 * 모듈을 새로 들인다 — 둘 중 하나만 하면 앞 테스트의 상태가 새어 들어온다.
 */
const CATALOG_ORIGIN = 'https://catalog.example.com';
// env 스텁과 `trustedOrigins` 단언이 같은 값을 봐야 한다
const CART_ORIGIN = 'https://cart.example.com';

beforeEach(() => {
  clearGlobalRegistries();
  vi.resetModules();
  vi.stubEnv('REMOTE_CATALOG_PUBLIC_URL', CATALOG_ORIGIN);
  vi.stubEnv('REMOTE_CART_PUBLIC_URL', CART_ORIGIN);
  vi.stubEnv('MF_REMOTE_PUBLIC_KEY', undefined);
  vi.stubEnv('MF_REQUIRE_SIGNATURE', undefined);
});

const load = () => import('./server');

/** remote 가 공표하는 매니페스트의 최소 형태 */
const manifest = (version = 't1abc') => ({
  version,
  ssrEntry: versionedPath(MF_FILES.ssrBundle, version),
  webEntry: versionedPath(MF_FILES.webManifest, version),
  ssrIntegrity: 'sha384-aaa',
  webIntegrity: 'sha384-bbb',
});

const okResponse = (body: unknown) =>
  ({ ok: true, json: async () => body }) as Response;

describe('주소 조립', () => {
  it('remoteOrigin 은 SSR 엔트리에서 오리진만 뽑는다', async () => {
    const { remoteOrigin } = await load();
    expect(remoteOrigin('catalog')).toBe(CATALOG_ORIGIN);
  });

  it('fallbackSsrEntry 는 버전 없는 엔트리다', async () => {
    const { fallbackSsrEntry } = await load();
    expect(fallbackSsrEntry('catalog')).toBe(
      `${CATALOG_ORIGIN}/${MF_FILES.ssrBundle}`,
    );
  });

  it('remoteVersionTag 는 remote 마다 다르다', async () => {
    const { remoteVersionTag } = await load();
    expect(remoteVersionTag('catalog')).toBe('mf-remote-version:catalog');
    expect(remoteVersionTag('catalog')).not.toBe(remoteVersionTag('cart'));
  });

  it('trustedOrigins 기본값은 설정된 remote 오리진뿐이다', async () => {
    vi.stubEnv('REMOTE_ALLOWED_ORIGINS', undefined);
    const { trustedOrigins } = await load();
    expect(trustedOrigins()).toEqual([CATALOG_ORIGIN, CART_ORIGIN]);
  });
});

describe('공표된 버전 (announcedVersion)', () => {
  it('기억하기 전에는 null 이다', async () => {
    const { announcedVersion } = await load();
    expect(announcedVersion('catalog')).toBeNull();
  });

  it('기억한 값을 그대로 돌려준다', async () => {
    const { announcedVersion, rememberVersion } = await load();
    const info = {
      version: 't1',
      ssrEntry: '/vt1/a.cjs',
      webEntry: '/vt1/b.json',
    };

    rememberVersion('catalog', info);

    expect(announcedVersion('catalog')).toEqual(info);
    expect(announcedVersion('cart')).toBeNull();
  });

  it('announcedVersions 는 버전 문자열만 추린다', async () => {
    const { announcedVersions, rememberVersion } = await load();
    rememberVersion('catalog', {
      version: 't1',
      ssrEntry: '/vt1/a.cjs',
      webEntry: '/vt1/b.json',
    });

    expect(announcedVersions()).toEqual({ catalog: 't1' });
  });
});

describe('fetchRemoteVersion', () => {
  const stubFetch = (impl: (url: string, init?: RequestInit) => unknown) => {
    const fn = vi.fn(impl);
    vi.stubGlobal('fetch', fn);
    return fn;
  };

  it('매니페스트를 읽어 기억한다', async () => {
    stubFetch(() => okResponse(manifest()));
    const { fetchRemoteVersion, announcedVersion } = await load();

    const info = await fetchRemoteVersion('catalog');

    expect(info).toEqual({
      version: 't1abc',
      ssrEntry: versionedPath(MF_FILES.ssrBundle, 't1abc'),
      webEntry: versionedPath(MF_FILES.webManifest, 't1abc'),
      ssrIntegrity: 'sha384-aaa',
    });
    expect(announcedVersion('catalog')).toEqual(info);
  });

  it('버전 매니페스트 주소를 조립한다', async () => {
    const fetchMock = stubFetch(() => okResponse(manifest()));
    const { fetchRemoteVersion } = await load();

    await fetchRemoteVersion('catalog');

    expect(fetchMock.mock.calls[0]![0]).toBe(
      `${CATALOG_ORIGIN}/${MF_FILES.versionManifest}`,
    );
  });

  it('제한 시간을 건다 — 매니페스트가 매달리면 그 뒤 전부가 매달린다', async () => {
    const fetchMock = stubFetch(() => okResponse(manifest()));
    const { fetchRemoteVersion } = await load();

    await fetchRemoteVersion('catalog');

    expect(fetchMock.mock.calls[0]![1]?.signal).toBeInstanceOf(AbortSignal);
  });

  it('프로덕션에서는 태그와 TTL 을 실어 보낸다', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const fetchMock = stubFetch(() => okResponse(manifest()));
    const { fetchRemoteVersion, remoteVersionTag } = await load();

    await fetchRemoteVersion('catalog');

    expect(fetchMock.mock.calls[0]![1]).toMatchObject({
      next: { revalidate: 30, tags: [remoteVersionTag('catalog')] },
    });
  });

  it('개발에서는 캐시하지 않는다', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    const fetchMock = stubFetch(() => okResponse(manifest()));
    const { fetchRemoteVersion } = await load();

    await fetchRemoteVersion('catalog');

    expect(fetchMock.mock.calls[0]![1]).toMatchObject({ cache: 'no-store' });
  });

  it('허용 목록 밖 오리진이면 아예 fetch 하지 않는다', async () => {
    vi.stubEnv('REMOTE_ALLOWED_ORIGINS', 'https://only.example.com');
    const fetchMock = stubFetch(() => okResponse(manifest()));
    const { fetchRemoteVersion } = await load();

    expect(await fetchRemoteVersion('catalog')).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('응답이 ok 가 아니면 null 이다', async () => {
    stubFetch(() => ({ ok: false, json: async () => ({}) }) as Response);
    const { fetchRemoteVersion } = await load();
    expect(await fetchRemoteVersion('catalog')).toBeNull();
  });

  it('네트워크가 던지면 null 이다 — remote 가 잠깐 안 뜬 것과 거부는 다른 사건이다', async () => {
    stubFetch(() => {
      throw new Error('ECONNREFUSED');
    });
    const { fetchRemoteVersion } = await load();
    expect(await fetchRemoteVersion('catalog')).toBeNull();
  });

  it('JSON 이 아니면 null 이다', async () => {
    stubFetch(
      () =>
        ({
          ok: true,
          json: async () => {
            throw new Error('Unexpected token');
          },
        }) as unknown as Response,
    );
    const { fetchRemoteVersion } = await load();
    expect(await fetchRemoteVersion('catalog')).toBeNull();
  });

  it.each([
    ['version 누락', { ...manifest(), version: undefined }],
    ['ssrEntry 누락', { ...manifest(), ssrEntry: undefined }],
    ['webEntry 누락', { ...manifest(), webEntry: undefined }],
    ['빈 객체', {}],
  ])('필수 필드가 없으면 null 이다 (%s)', async (_label, body) => {
    stubFetch(() => okResponse(body));
    const { fetchRemoteVersion } = await load();
    expect(await fetchRemoteVersion('catalog')).toBeNull();
  });

  it('아직 stamp 안 한 remote 와 못 읽는 remote 를 구분하지 않는다', async () => {
    // 둘 다 "버전을 모른다" 이고, 그때 할 일은 같다 — 폴백 엔트리.
    stubFetch(() => okResponse({}));
    const { fetchRemoteVersion, announcedVersion } = await load();

    expect(await fetchRemoteVersion('catalog')).toBeNull();
    expect(announcedVersion('catalog')).toBeNull();
  });

  describe('검증 실패는 조용히 넘기지 않는다', () => {
    let error: ReturnType<typeof vi.spyOn>;
    beforeEach(() => {
      error = vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    it.each([
      [
        '위험한 버전 문자열',
        { ...manifest('1</script>'), version: '1</script>' },
      ],
      [
        '다른 오리진을 가리키는 엔트리',
        { ...manifest(), ssrEntry: 'https://evil.example.com/x.cjs' },
      ],
      [
        '버전과 다른 디렉터리',
        { ...manifest(), webEntry: '/vt9zzz/mf-manifest.json' },
      ],
      ['상위 경로 탈출', { ...manifest(), ssrEntry: '/vt1abc/../../x.cjs' }],
    ])('%s 은 거부하고 로그를 남긴다', async (_label, body) => {
      stubFetch(() => okResponse(body));
      const { fetchRemoteVersion, announcedVersion } = await load();

      expect(await fetchRemoteVersion('catalog')).toBeNull();
      expect(error).toHaveBeenCalledOnce();
      // 폴백으로 흘러가면 막은 의미가 없다 — 기억도 하지 않는다.
      expect(announcedVersion('catalog')).toBeNull();
    });

    it('서명 강제인데 서명이 없으면 거부한다', async () => {
      const { publicKey } = generateSigningKeyPair();
      vi.stubEnv('MF_REMOTE_PUBLIC_KEY', publicKey);
      vi.stubEnv('MF_REQUIRE_SIGNATURE', '1');
      stubFetch(() => okResponse(manifest()));

      const { fetchRemoteVersion } = await load();

      expect(await fetchRemoteVersion('catalog')).toBeNull();
      expect(error).toHaveBeenCalledOnce();
    });

    it('올바르게 서명된 매니페스트는 통과한다', async () => {
      const { privateKey, publicKey } = generateSigningKeyPair();
      vi.stubEnv('MF_REMOTE_PUBLIC_KEY', publicKey);
      vi.stubEnv('MF_REQUIRE_SIGNATURE', '1');

      const { signedPayload } = await import('../remote-trust');
      const body = manifest();
      const signature = signPayload(
        signedPayload({ remote: 'catalog', ...body }),
        privateKey,
      );
      stubFetch(() => okResponse({ ...body, signature }));

      const { fetchRemoteVersion } = await load();

      expect(await fetchRemoteVersion('catalog')).not.toBeNull();
      expect(error).not.toHaveBeenCalled();
    });
  });
});
