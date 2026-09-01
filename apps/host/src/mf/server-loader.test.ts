import { MF_FILES, SSR_EXTERNALS, versionedPath } from '@mfa/remote-config';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { clearGlobalRegistries } from '@tests/helpers/globals';

/**
 * host **서버**가 remote 의 CJS 번들을 받아 `new Function` 으로 평가하는 자리.
 *
 * `new Function` 이라 테스트가 오히려 쉽다 — 번들 문자열을 여기서 직접 만들면
 * requireShim 동작과 expose 언랩을 정확히 태울 수 있다.
 *
 * 모듈 스코프 `bundleCache` 와 `globalCell` 을 함께 쓰므로 매번 둘 다 비운다.
 */
const ORIGIN = 'https://catalog.example.com';

beforeEach(() => {
  clearGlobalRegistries();
  vi.resetModules();
  vi.stubEnv('REMOTE_CATALOG_PUBLIC_URL', ORIGIN);
  vi.stubEnv('REMOTE_CART_PUBLIC_URL', 'https://cart.example.com');
  vi.stubEnv('NODE_ENV', 'test');
});

/** remote 가 내보내는 CJS 번들을 흉내낸다 */
const bundle = (source: string) => {
  const bytes = new TextEncoder().encode(source);
  return {
    ok: true,
    status: 200,
    arrayBuffer: async () => bytes.buffer as ArrayBuffer,
  } as Response;
};

const EXPOSES = `module.exports = { './ProductGrid': 'grid', './ProductDetail': 'detail' };`;

const stubFetch = (impl: (url: string, init?: RequestInit) => unknown) => {
  const fn = vi.fn(impl);
  vi.stubGlobal('fetch', fn);
  return fn;
};

/**
 * 매니페스트 조회에는 "없다"고 답하고 번들만 준다.
 *
 * `resolveEntry` 는 아는 버전이 없으면 `fetchRemoteVersion` 을 부르므로, 그냥 stub 하면
 * **한 번의 로드에 fetch 가 두 번** 일어난다. 호출 수를 세는 테스트가 그걸 구분하지 못하면
 * 캐시가 동작하는지 안 하는지를 못 본다. 반환값은 **번들 요청만** 담는다.
 */
const stubBundleOnly = (respond: () => unknown) => {
  const bundleCalls: { url: string; init?: RequestInit }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: RequestInit) => {
      if (url.endsWith(MF_FILES.versionManifest))
        return { ok: false } as Response;
      bundleCalls.push({ url, init });
      return respond();
    }),
  );
  return bundleCalls;
};

/** 버전을 미리 기억시켜 `resolveEntry` 가 매니페스트를 조회하지 않게 한다 */
const rememberVersions = async (version = 't1abc') => {
  const { rememberVersion } = await import('./versions/server');
  for (const remote of ['catalog', 'cart'] as const) {
    rememberVersion(remote, {
      version,
      ssrEntry: versionedPath(MF_FILES.ssrBundle, version),
      webEntry: versionedPath(MF_FILES.webManifest, version),
    });
  }
};

const load = () => import('./server-loader');

describe('태그 — remote 하나에 두 개', () => {
  it('번들 fetch 용과 페이지 캐시용이 다르다', async () => {
    // 태그가 하나면 warm-then-revalidate 의 순서를 못 만든다. 번들을 깨는 순간
    // 페이지도 같이 깨져서 재생성이 warm 보다 먼저 일어날 수 있다.
    const { remoteBundleTag, remoteCacheTag } = await load();

    expect(remoteBundleTag('catalog')).toBe('mf-remote-bundle:catalog');
    expect(remoteCacheTag('catalog')).toBe('mf-remote:catalog');
    expect(remoteBundleTag('catalog')).not.toBe(remoteCacheTag('catalog'));
  });

  it('remote 마다 다르다', async () => {
    const { remoteBundleTag, remoteCacheTag } = await load();
    expect(remoteBundleTag('catalog')).not.toBe(remoteBundleTag('cart'));
    expect(remoteCacheTag('catalog')).not.toBe(remoteCacheTag('cart'));
  });
});

describe('loadRemoteModuleOnServer — id 해석', () => {
  it("'catalog/ProductGrid' 를 './ProductGrid' 로 찾는다", async () => {
    stubFetch(() => bundle(EXPOSES));
    const { loadRemoteModuleOnServer } = await load();

    expect(await loadRemoteModuleOnServer('catalog/ProductGrid')).toEqual({
      default: 'grid',
    });
  });

  it('다단계 경로도 그대로 이어 붙인다', async () => {
    stubFetch(() => bundle(`module.exports = { './a/b': 'nested' };`));
    const { loadRemoteModuleOnServer } = await load();

    expect(
      await loadRemoteModuleOnServer('catalog/a/b' as 'catalog/ProductGrid'),
    ).toEqual({ default: 'nested' });
  });

  it('없는 expose 는 사용 가능한 목록을 담아 던진다', async () => {
    stubFetch(() => bundle(EXPOSES));
    const { loadRemoteModuleOnServer } = await load();

    await expect(
      loadRemoteModuleOnServer('catalog/Missing' as 'catalog/ProductGrid'),
    ).rejects.toThrow(/'\.\/Missing' 가 없습니다.*\.\/ProductGrid/s);
  });

  it('expose 가 하나도 없으면 "(없음)" 이라고 말한다', async () => {
    stubFetch(() => bundle('module.exports = {};'));
    const { loadRemoteModuleOnServer } = await load();

    await expect(
      loadRemoteModuleOnServer('catalog/ProductGrid'),
    ).rejects.toThrow(/\(없음\)/);
  });
});

describe('번들 평가', () => {
  it('module.exports.default 가 있으면 언랩한다', async () => {
    // 번들러에 따라 default 아래에 맵이 온다.
    stubFetch(() => bundle(`module.exports = { default: { './X': 'v' } };`));
    const { loadRemoteModuleOnServer } = await load();

    expect(
      await loadRemoteModuleOnServer('catalog/X' as 'catalog/ProductGrid'),
    ).toEqual({ default: 'v' });
  });

  it('exports 객체에 직접 담아도 받는다', async () => {
    stubFetch(() => bundle(`exports['./X'] = 'v';`));
    const { loadRemoteModuleOnServer } = await load();

    expect(
      await loadRemoteModuleOnServer('catalog/X' as 'catalog/ProductGrid'),
    ).toEqual({ default: 'v' });
  });

  it('expose 맵이 객체가 아니면 던진다', async () => {
    stubFetch(() => bundle(`module.exports = { default: 42 };`));
    const { loadRemoteModuleOnServer } = await load();

    await expect(
      loadRemoteModuleOnServer('catalog/ProductGrid'),
    ).rejects.toThrow(/expose 맵을 내보내지 않았습니다/);
  });

  it('host 의 React 를 주입한다', async () => {
    // 주입이 안 되면 서버에 React 가 두 벌이 되어 훅이 깨진다.
    stubFetch(() =>
      bundle(`
        const React = require('react');
        module.exports = { './X': typeof React.useState };
      `),
    );
    const { loadRemoteModuleOnServer } = await load();

    expect(
      await loadRemoteModuleOnServer('catalog/X' as 'catalog/ProductGrid'),
    ).toEqual({ default: 'function' });
  });

  it('SSR_EXTERNALS 의 모든 키를 require 할 수 있다', async () => {
    // 하나라도 빠지면 "예상 밖 모듈을 require 했습니다" 로 remote 가 통째로 안 뜬다.
    const requires = SSR_EXTERNALS.map(
      (id) => `require(${JSON.stringify(id)})`,
    );
    stubFetch(() =>
      bundle(`module.exports = { './X': [${requires.join(',')}].length };`),
    );
    const { loadRemoteModuleOnServer } = await load();

    expect(
      await loadRemoteModuleOnServer('catalog/X' as 'catalog/ProductGrid'),
    ).toEqual({ default: SSR_EXTERNALS.length });
  });

  it('허용 목록 밖 모듈을 require 하면 번들러 설정을 가리키며 던진다', async () => {
    stubFetch(() => bundle(`require('node:fs'); module.exports = {};`));
    const { loadRemoteModuleOnServer } = await load();

    await expect(
      loadRemoteModuleOnServer('catalog/ProductGrid'),
    ).rejects.toThrow(/예상 밖 모듈을 require 했습니다: 'node:fs'/);
  });
});

describe('가져오기 실패', () => {
  it('허용 목록 밖 오리진이면 아예 fetch 하지 않는다', async () => {
    vi.stubEnv('REMOTE_ALLOWED_ORIGINS', 'https://only.example.com');
    const fetchMock = stubFetch(() => bundle(EXPOSES));
    const { loadRemoteModuleOnServer } = await load();

    await expect(
      loadRemoteModuleOnServer('catalog/ProductGrid'),
    ).rejects.toThrow(/허용 목록에 없습니다/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('상태 코드 실패는 상태 코드를 담아 던진다', async () => {
    stubFetch(() => ({ ok: false, status: 502 }) as Response);
    const { loadRemoteModuleOnServer } = await load();

    await expect(
      loadRemoteModuleOnServer('catalog/ProductGrid'),
    ).rejects.toThrow(/SSR 번들 응답 502/);
  });

  it('연결 실패는 remote 를 띄우는 방법을 알려준다', async () => {
    stubFetch(() => {
      throw new TypeError('fetch failed');
    });
    const { loadRemoteModuleOnServer } = await load();

    await expect(
      loadRemoteModuleOnServer('catalog/ProductGrid'),
    ).rejects.toThrow(/가져오지 못했습니다.*pnpm dev/s);
  });

  it('제한 시간 초과는 "응답이 끝나지 않았다" 로 구분한다', async () => {
    // 연결은 됐는데 본문이 안 끝나는 경우다. 헤더는 오므로 res.ok 까지 통과하고
    // 실제로 매달리는 자리는 arrayBuffer() 다.
    stubFetch(() => ({
      ok: true,
      status: 200,
      arrayBuffer: async () => {
        throw Object.assign(new Error('The operation was aborted'), {
          name: 'TimeoutError',
        });
      },
    }));
    const { loadRemoteModuleOnServer } = await load();

    await expect(
      loadRemoteModuleOnServer('catalog/ProductGrid'),
    ).rejects.toThrow(/안에 SSR 번들을 다 주지 못했습니다/);
  });

  it('원인을 cause 로 남긴다', async () => {
    const cause = new TypeError('fetch failed');
    stubFetch(() => {
      throw cause;
    });
    const { loadRemoteModuleOnServer } = await load();

    await expect(
      loadRemoteModuleOnServer('catalog/ProductGrid'),
    ).rejects.toMatchObject({ cause });
  });

  it('무결성이 어긋나면 평가하지 않는다', async () => {
    // 이 줄 아래부터가 남의 코드를 이 프로세스에서 실행하는 구간이다.
    stubFetch(() => bundle(`throw new Error('평가되면 안 된다');`));
    const { rememberVersion } = await import('./versions/server');
    rememberVersion('catalog', {
      version: 't1abc',
      ssrEntry: versionedPath(MF_FILES.ssrBundle, 't1abc'),
      webEntry: versionedPath(MF_FILES.webManifest, 't1abc'),
      ssrIntegrity: 'sha384-어긋난값',
    });
    const { loadRemoteModuleOnServer } = await load();

    await expect(
      loadRemoteModuleOnServer('catalog/ProductGrid'),
    ).rejects.toThrow(/무결성 불일치/);
  });
});

describe('엔트리 해석', () => {
  it('버전을 모르면 폴백 엔트리를 쓴다', async () => {
    const calls = stubBundleOnly(() => bundle(EXPOSES));
    const { loadRemoteModuleOnServer } = await load();

    await loadRemoteModuleOnServer('catalog/ProductGrid');

    expect(calls[0]!.url).toBe(`${ORIGIN}/${MF_FILES.ssrBundle}`);
  });

  it('아는 버전이 있으면 불변 경로를 쓰고 재조회하지 않는다', async () => {
    // 여기서 또 조회하면 warm 도중 Data Cache 의 옛 응답이 방금 정한 버전을 덮는다.
    const fetchMock = stubFetch(() => bundle(EXPOSES));
    await rememberVersions();
    const { loadRemoteModuleOnServer } = await load();

    await loadRemoteModuleOnServer('catalog/ProductGrid');

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0]![0]).toBe(
      `${ORIGIN}/vt1abc/${MF_FILES.ssrBundle}`,
    );
  });

  it('개발에서는 캐시하지 않는 옵션으로 받는다', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    const calls = stubBundleOnly(() => bundle(EXPOSES));
    const { loadRemoteModuleOnServer } = await load();

    await loadRemoteModuleOnServer('catalog/ProductGrid');

    expect(calls[0]!.init).toMatchObject({ cache: 'no-store' });
  });

  it('프로덕션에서는 Data Cache 에 태그를 달아 올린다', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    // 무결성 강제는 remote-trust 쪽에서 따로 검증한다. 여기서 보려는 건 fetch 옵션이다.
    vi.stubEnv('MF_REQUIRE_INTEGRITY', '0');
    const calls = stubBundleOnly(() => bundle(EXPOSES));
    const { loadRemoteModuleOnServer, remoteBundleTag } = await load();

    await loadRemoteModuleOnServer('catalog/ProductGrid');

    expect(calls[0]!.init).toMatchObject({
      cache: 'force-cache',
      next: { tags: [remoteBundleTag('catalog')] },
    });
  });

  it('제한 시간을 건다', async () => {
    const calls = stubBundleOnly(() => bundle(EXPOSES));
    const { loadRemoteModuleOnServer } = await load();

    await loadRemoteModuleOnServer('catalog/ProductGrid');

    expect(calls[0]!.init?.signal).toBeInstanceOf(AbortSignal);
  });
});

describe('캐시 — 프로덕션에서만', () => {
  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'production');
    // 무결성 강제는 remote-trust 쪽에서 따로 검증한다. 여기서 보려는 건 캐시 동작이다.
    vi.stubEnv('MF_REQUIRE_INTEGRITY', '0');
  });

  it('같은 버전 · 같은 세대면 다시 받지 않는다', async () => {
    const calls = stubBundleOnly(() => bundle(EXPOSES));
    await rememberVersions();
    const { loadRemoteModuleOnServer } = await load();

    await loadRemoteModuleOnServer('catalog/ProductGrid');
    await loadRemoteModuleOnServer('catalog/ProductDetail');

    expect(calls).toHaveLength(1);
  });

  it('개발에서는 매번 받는다 — watch 빌드가 번들을 계속 갱신한다', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    const calls = stubBundleOnly(() => bundle(EXPOSES));
    await rememberVersions();
    const { loadRemoteModuleOnServer } = await load();

    await loadRemoteModuleOnServer('catalog/ProductGrid');
    await loadRemoteModuleOnServer('catalog/ProductGrid');

    expect(calls).toHaveLength(2);
  });

  it('warm 세대가 오르면 다시 받아 다시 검증한다', async () => {
    // 버전만으로 키잉하면 "같은 버전인데 바이트가 바뀐" 경우를 못 잡는다.
    const calls = stubBundleOnly(() => bundle(EXPOSES));
    await rememberVersions();
    const { bumpWarmEpoch } = await import('./warm-state');
    const { loadRemoteModuleOnServer } = await load();

    await loadRemoteModuleOnServer('catalog/ProductGrid');
    bumpWarmEpoch();
    await loadRemoteModuleOnServer('catalog/ProductGrid');

    expect(calls).toHaveLength(2);
  });

  it('공표된 버전이 바뀌면 다시 받는다', async () => {
    const calls = stubBundleOnly(() => bundle(EXPOSES));
    await rememberVersions('t1abc');
    const { loadRemoteModuleOnServer } = await load();
    await loadRemoteModuleOnServer('catalog/ProductGrid');

    await rememberVersions('t2def');
    await loadRemoteModuleOnServer('catalog/ProductGrid');

    expect(calls.map((c) => c.url)).toEqual([
      `${ORIGIN}/vt1abc/${MF_FILES.ssrBundle}`,
      `${ORIGIN}/vt2def/${MF_FILES.ssrBundle}`,
    ]);
  });

  it('적재에 성공하면 그 버전을 준비 완료로 표시한다', async () => {
    stubBundleOnly(() => bundle(EXPOSES));
    await rememberVersions();
    const { isBundleReady, warmEpoch } = await import('./warm-state');
    const { loadRemoteModuleOnServer } = await load();

    await loadRemoteModuleOnServer('catalog/ProductGrid');

    expect(isBundleReady('catalog', 't1abc', warmEpoch())).toBe(true);
  });

  it('실패한 promise 를 캐시에 남기지 않는다', async () => {
    // 남기면 서버가 살아있는 동안 계속 같은 실패를 돌려준다.
    let attempt = 0;
    const calls = stubBundleOnly(() => {
      attempt += 1;
      if (attempt === 1) throw new TypeError('fetch failed');
      return bundle(EXPOSES);
    });
    await rememberVersions();
    const { loadRemoteModuleOnServer } = await load();

    await expect(
      loadRemoteModuleOnServer('catalog/ProductGrid'),
    ).rejects.toThrow();
    expect(await loadRemoteModuleOnServer('catalog/ProductGrid')).toEqual({
      default: 'grid',
    });
    expect(calls).toHaveLength(2);
  });

  it('remote 별로 따로 캐시한다', async () => {
    const calls = stubBundleOnly(() => bundle(EXPOSES));
    await rememberVersions();
    const { loadRemoteModuleOnServer } = await load();

    await loadRemoteModuleOnServer('catalog/ProductGrid');
    await loadRemoteModuleOnServer('cart/ProductGrid' as 'catalog/ProductGrid');

    expect(calls.map((c) => c.url)).toEqual([
      `${ORIGIN}/vt1abc/${MF_FILES.ssrBundle}`,
      `https://cart.example.com/vt1abc/${MF_FILES.ssrBundle}`,
    ]);
  });
});

describe('계측', () => {
  it('성공하면 fetch · eval · load 를 순서대로 센다', async () => {
    stubFetch(() => bundle(EXPOSES));
    const { getLoaderStats, resetLoaderStats } = await import('./loader-stats');
    resetLoaderStats();
    const { loadRemoteModuleOnServer } = await load();

    await loadRemoteModuleOnServer('catalog/ProductGrid');

    expect(getLoaderStats()).toEqual({
      fetches: 1,
      evals: 1,
      byRemote: { catalog: 1 },
      loads: { catalog: 1 },
    });
  });

  it('실패하면 시도만 세고 성공은 세지 않는다', async () => {
    // remote 를 렌더하는 페이지는 RemoteBoundary 로 감싸여 있어 remote 가 죽어도 200 이다.
    // 그래서 이 두 축이 갈라져 있어야 진단이 된다.
    stubFetch(() => ({ ok: false, status: 500 }) as Response);
    const { getLoaderStats, resetLoaderStats } = await import('./loader-stats');
    resetLoaderStats();
    const { loadRemoteModuleOnServer } = await load();

    await expect(
      loadRemoteModuleOnServer('catalog/ProductGrid'),
    ).rejects.toThrow();

    const stats = getLoaderStats();
    expect(stats.byRemote.catalog).toBe(1);
    expect(stats.evals).toBe(0);
    expect(stats.loads).toEqual({});
  });

  it('허용 목록에서 막히면 fetch 시도도 세지 않는다', async () => {
    vi.stubEnv('REMOTE_ALLOWED_ORIGINS', 'https://only.example.com');
    stubFetch(() => bundle(EXPOSES));
    const { getLoaderStats, resetLoaderStats } = await import('./loader-stats');
    resetLoaderStats();
    const { loadRemoteModuleOnServer } = await load();

    await expect(
      loadRemoteModuleOnServer('catalog/ProductGrid'),
    ).rejects.toThrow();
    expect(getLoaderStats().fetches).toBe(0);
  });
});

describe('ssrEntrySnapshot', () => {
  it('버전을 모르면 폴백 엔트리를 보여준다', async () => {
    const { ssrEntrySnapshot } = await load();
    expect(ssrEntrySnapshot().catalog).toBe(`${ORIGIN}/${MF_FILES.ssrBundle}`);
  });

  it('아는 버전이 있으면 불변 경로를 보여준다', async () => {
    const { rememberVersion } = await import('./versions/server');
    rememberVersion('catalog', {
      version: 't1abc',
      ssrEntry: versionedPath(MF_FILES.ssrBundle, 't1abc'),
      webEntry: versionedPath(MF_FILES.webManifest, 't1abc'),
    });
    const { ssrEntrySnapshot } = await load();

    expect(ssrEntrySnapshot().catalog).toBe(
      `${ORIGIN}/vt1abc/${MF_FILES.ssrBundle}`,
    );
  });

  it('remote 를 빠짐없이 담는다', async () => {
    const { ssrEntrySnapshot } = await load();
    expect(Object.keys(ssrEntrySnapshot()).sort()).toEqual(['cart', 'catalog']);
  });
});
