import { beforeEach, describe, expect, it } from 'vitest';

import {
  getLoaderStats,
  recordEval,
  recordFetch,
  recordLoad,
  resetLoaderStats,
} from './loader-stats';

/**
 * ⚠️ `clearGlobalRegistries()` 를 쓰지 않는다. 이 모듈은 셀 참조를 **모듈 스코프에
 * 캐시**하므로(`const stats = globalCell(...)`), 레지스트리만 비우면 모듈이 붙잡고 있는
 * 옛 셀을 계속 쓴다. 이 모듈이 자기 리셋 API 를 갖고 있으니 그걸 쓰는 게 맞다.
 */
beforeEach(resetLoaderStats);

describe('카운터', () => {
  it('처음에는 전부 0 이다', () => {
    expect(getLoaderStats()).toEqual({
      fetches: 0,
      evals: 0,
      byRemote: {},
      loads: {},
    });
  });

  it('recordFetch 는 전체와 remote 별을 같이 올린다', () => {
    recordFetch('catalog');
    recordFetch('catalog');
    recordFetch('cart');

    const stats = getLoaderStats();
    expect(stats.fetches).toBe(3);
    expect(stats.byRemote).toEqual({ catalog: 2, cart: 1 });
  });

  it('recordEval 은 평가 횟수만 올린다', () => {
    recordEval();
    recordEval();
    expect(getLoaderStats().evals).toBe(2);
    expect(getLoaderStats().fetches).toBe(0);
  });

  it('recordLoad 는 성공만 센다 — fetch 와 다른 축이다', () => {
    // remote 를 렌더하는 페이지는 RemoteBoundary 로 감싸여 있어 remote 가 죽어도 200 이다.
    // 그래서 HTTP 상태로는 성공 여부를 알 수 없고 이 카운터가 필요하다.
    recordFetch('catalog');
    recordFetch('catalog');
    recordLoad('catalog');

    const stats = getLoaderStats();
    expect(stats.byRemote.catalog).toBe(2);
    expect(stats.loads.catalog).toBe(1);
  });

  it('처음 보는 remote 도 0 에서 시작해 올린다', () => {
    recordFetch('새-remote');
    recordLoad('새-remote');
    expect(getLoaderStats().byRemote['새-remote']).toBe(1);
    expect(getLoaderStats().loads['새-remote']).toBe(1);
  });
});

describe('getLoaderStats — 내부 객체를 넘기지 않는다', () => {
  it('중첩 객체까지 복사해서 준다', () => {
    recordFetch('catalog');
    const first = getLoaderStats();
    const second = getLoaderStats();

    expect(first).not.toBe(second);
    expect(first.byRemote).not.toBe(second.byRemote);
    expect(first.loads).not.toBe(second.loads);
  });

  it('반환값을 고쳐도 내부가 안 바뀐다', () => {
    recordFetch('catalog');

    const snapshot = getLoaderStats();
    snapshot.fetches = 999;
    snapshot.byRemote.catalog = 999;
    snapshot.loads.catalog = 999;

    const fresh = getLoaderStats();
    expect(fresh.fetches).toBe(1);
    expect(fresh.byRemote.catalog).toBe(1);
    expect(fresh.loads).toEqual({});
  });

  it('스냅샷은 이후 변화를 반영하지 않는다', () => {
    const snapshot = getLoaderStats();
    recordFetch('catalog');
    expect(snapshot.fetches).toBe(0);
  });
});

describe('resetLoaderStats', () => {
  it('모든 축을 0 으로 되돌린다', () => {
    recordFetch('catalog');
    recordEval();
    recordLoad('catalog');

    resetLoaderStats();

    expect(getLoaderStats()).toEqual({
      fetches: 0,
      evals: 0,
      byRemote: {},
      loads: {},
    });
  });

  it('리셋 후에도 계속 셀 수 있다', () => {
    recordFetch('catalog');
    resetLoaderStats();
    recordFetch('cart');
    expect(getLoaderStats()).toMatchObject({
      fetches: 1,
      byRemote: { cart: 1 },
    });
  });
});
