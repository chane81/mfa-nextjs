import { MF_FILES } from '@mfa/remote-config';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { clearGlobalRegistries } from '@tests/helpers/globals';

import { REMOTE_VERSIONS_GLOBAL } from './browser';

/**
 * 렌더 코드의 **유일한 소비 창구**. 여기서 지키는 계약은 하나다 —
 * "서버 값과 브라우저 값 중 있는 쪽을 집는다."
 *
 * 24차 전에는 창구가 없어서 `RemoteComponent` 가 서버 전용 저장소를 직접 읽었고,
 * 브라우저 렌더가 늘 "버전 모름" 으로 떨어져 CSS 가 404 였다(known-issues G-1).
 */
const load = () => import('./index');

const stubInjected = (
  value: Record<string, { version: string; entry: string }>,
) => vi.stubGlobal(REMOTE_VERSIONS_GLOBAL, value);

const rememberOnServer = async (
  remote: 'catalog' | 'cart',
  version: string,
) => {
  const { rememberVersion } = await import('./server');
  rememberVersion(remote, {
    version,
    ssrEntry: `/v${version}/${MF_FILES.ssrBundle}`,
    webEntry: `/v${version}/${MF_FILES.webManifest}`,
  });
};

beforeEach(() => {
  clearGlobalRegistries();
  vi.resetModules();
});

describe('remoteVersion', () => {
  it('양쪽 다 비어 있으면 null — 호출부가 버전 없는 경로로 폴백한다', async () => {
    const { remoteVersion } = await load();
    expect(remoteVersion('catalog')).toBeNull();
  });

  it('서버 값만 있으면 그걸 본다 (SSR 경로)', async () => {
    await rememberOnServer('catalog', 't1abc');
    const { remoteVersion } = await load();
    expect(remoteVersion('catalog')).toBe('t1abc');
  });

  it('심어준 값만 있으면 그걸 본다 (브라우저 경로)', async () => {
    // `globalCell` 은 비어 있다 — 브라우저에서는 언제나 그렇다.
    stubInjected({
      catalog: {
        version: 't9zzz',
        entry: `https://catalog.example.com/vt9zzz/${MF_FILES.webManifest}`,
      },
    });
    const { remoteVersion } = await load();
    expect(remoteVersion('catalog')).toBe('t9zzz');
  });

  it('remote 마다 따로 판단한다 — 한쪽만 심어줘도 다른 쪽은 서버 값을 본다', async () => {
    /**
     * 실제로 두 값이 동시에 차는 환경은 없다(주입은 브라우저, `globalCell` 은 서버).
     * 그래서 여기서 보는 건 우선순위가 아니라 **remote 별 격리**다.
     */
    await rememberOnServer('cart', 't2def');
    stubInjected({
      catalog: {
        version: 't9zzz',
        entry: `https://catalog.example.com/vt9zzz/${MF_FILES.webManifest}`,
      },
    });
    const { remoteVersion } = await load();

    expect(remoteVersion('catalog')).toBe('t9zzz');
    expect(remoteVersion('cart')).toBe('t2def');
  });
});
