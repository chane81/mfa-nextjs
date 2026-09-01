import { beforeEach, describe, expect, it, vi } from 'vitest';

import { clearGlobalRegistries } from '@tests/helpers/globals';

/**
 * warm 상태 — "무엇을 들고 있고 언제 들었는가."
 *
 * 여기서 지키는 계약은 하나다: **버전만 같아서는 준비가 아니다.** epoch 까지 같아야
 * 이번 warm 이 실제로 적재한 것이다. 그 구멍으로 변조된 배포가 통과한 적이 있다
 * (무결성 검사는 막았는데 웹훅은 200 — known-issues A-6).
 *
 * `globalCell` 은 realm 전역이라 `vi.resetModules()` 로 안 지워진다. 매번 비운다.
 */
const load = () => import('./warm-state');

beforeEach(() => {
  clearGlobalRegistries();
  vi.resetModules();
});

describe('적재된 버전 (isBundleReady)', () => {
  it('적재 전에는 준비되지 않았다', async () => {
    const { isBundleReady, readyVersion } = await load();
    expect(readyVersion('catalog')).toBeNull();
    expect(isBundleReady('catalog', 't1', 0)).toBe(false);
  });

  it('버전과 epoch 이 모두 같아야 준비다', async () => {
    const { isBundleReady, markBundleReady, readyVersion } = await load();
    markBundleReady('catalog', 't1', 5);

    expect(readyVersion('catalog')).toBe('t1');
    expect(isBundleReady('catalog', 't1', 5)).toBe(true);
  });

  it('버전이 같아도 epoch 이 다르면 준비가 아니다', async () => {
    // 버전만 비교하면 예전에 같은 버전을 적재해 둔 상태를 성공으로 오인한다.
    // 실제로 변조된 배포가 그 구멍으로 웹훅 200 을 받아냈다.
    const { isBundleReady, markBundleReady } = await load();
    markBundleReady('catalog', 't1', 5);

    expect(isBundleReady('catalog', 't1', 6)).toBe(false);
  });

  it('epoch 이 같아도 버전이 다르면 준비가 아니다', async () => {
    const { isBundleReady, markBundleReady } = await load();
    markBundleReady('catalog', 't1', 5);

    expect(isBundleReady('catalog', 't2', 5)).toBe(false);
  });

  it('공표된 버전과 적재된 버전은 별개다', async () => {
    const { isBundleReady } = await load();
    const { announcedVersion, rememberVersion } = await import(
      './versions/server'
    );
    rememberVersion('catalog', {
      version: 't2',
      ssrEntry: '/vt2/a.cjs',
      webEntry: '/vt2/b.json',
    });

    expect(announcedVersion('catalog')?.version).toBe('t2');
    expect(isBundleReady('catalog', 't2', 0)).toBe(false);
  });
});

describe('warm 세대 (epoch)', () => {
  it('0 에서 시작해 하나씩 오른다', async () => {
    const { bumpWarmEpoch, warmEpoch } = await load();
    expect(warmEpoch()).toBe(0);
    expect(bumpWarmEpoch()).toBe(1);
    expect(bumpWarmEpoch()).toBe(2);
    expect(warmEpoch()).toBe(2);
  });
});
