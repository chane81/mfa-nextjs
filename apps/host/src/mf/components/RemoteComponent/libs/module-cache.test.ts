import { MF_FILES } from '@mfa/remote-config';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { clearGlobalRegistries } from '@mfa/utils/test/globals';

import { REMOTE_VERSIONS_GLOBAL } from '../../../versions/browser';

/**
 * 적재 캐시 키 규칙. **버전이 키에 들어가는가**가 전부다 — 빠지면 재배포해도 옛 모듈이
 * 프로세스 수명 내내 고정된다(known-issues A-2 · G-1).
 *
 * `loader/index.ts` 는 `@module-federation/runtime` 을 초기화하므로 모킹한다.
 * 키 계산에는 DOM 이 필요 없어서 이 파일은 node project 에서 돈다.
 */
vi.mock('../../../loader', () => ({ loadRemoteModule: vi.fn() }));

beforeEach(() => {
  clearGlobalRegistries();
  vi.resetModules();
});

const load = () => import('./module-cache');

const stubInjectedVersions = (
  value: Record<string, { version: string; entry: string }>,
) => vi.stubGlobal(REMOTE_VERSIONS_GLOBAL, value);

const announce = async (remote: 'catalog' | 'cart', version: string) => {
  const { rememberVersion } = await import('../../../versions/server');
  rememberVersion(remote, {
    version,
    ssrEntry: `/v${version}/${MF_FILES.ssrBundle}`,
    webEntry: `/v${version}/${MF_FILES.webManifest}`,
  });
};

describe('remoteCacheKey', () => {
  it('버전을 키에 넣는다', async () => {
    const { remoteCacheKey } = await load();

    expect(remoteCacheKey('catalog/ProductGrid')).toBe(
      'catalog/ProductGrid@unversioned',
    );

    await announce('catalog', 't1abc');

    expect(remoteCacheKey('catalog/ProductGrid')).toBe(
      'catalog/ProductGrid@t1abc',
    );
  });

  it('브라우저에서는 심어준 버전이 키에 들어간다', async () => {
    // 여기가 `unversioned` 로 굳으면 재배포해도 브라우저의 적재 캐시가 안 무효화된다.
    stubInjectedVersions({
      catalog: {
        version: 't9zzz',
        entry: `https://catalog.example.com/vt9zzz/${MF_FILES.webManifest}`,
      },
    });
    const { remoteCacheKey } = await load();

    expect(remoteCacheKey('catalog/ProductGrid')).toBe(
      'catalog/ProductGrid@t9zzz',
    );
    expect(remoteCacheKey('cart/CartBadge')).toBe('cart/CartBadge@unversioned');
  });

  it('reloadKey 가 있으면 뒤에 붙인다', async () => {
    const { remoteCacheKey } = await load();
    expect(remoteCacheKey('catalog/ProductGrid', 'nonce-1')).toBe(
      'catalog/ProductGrid@unversioned#nonce-1',
    );
  });

  it('remote 마다 자기 버전을 본다', async () => {
    const { remoteCacheKey } = await load();
    await announce('cart', 't2def');

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
