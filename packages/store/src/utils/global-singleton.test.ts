import { beforeEach, describe, expect, it, vi } from 'vitest';

import { clearGlobalRegistries } from '@tests/helpers/globals';

/**
 * `Symbol.for` 레지스트리는 realm 전역이라 `vi.resetModules()` 로 안 지워진다.
 * 매번 비우지 않으면 앞 테스트가 심어둔 인스턴스를 그대로 물려받는다.
 */
beforeEach(() => {
  clearGlobalRegistries();
  vi.resetModules();
});

const load = async () => (await import('./global-singleton')).globalSingleton;

describe('globalSingleton', () => {
  it('같은 이름은 create 를 한 번만 부른다', async () => {
    const globalSingleton = await load();
    const create = vi.fn(() => ({ n: 1 }));

    const first = globalSingleton('cart', create);
    const second = globalSingleton('cart', create);

    expect(create).toHaveBeenCalledTimes(1);
    expect(second).toBe(first);
  });

  it('먼저 도착한 쪽이 이긴다 — 뒤에 온 create 는 무시된다', async () => {
    // MF 에서 버전이 다른 사본이 섞이면 실제로 생기는 상황이다.
    const globalSingleton = await load();
    const winner = { who: 'first' };

    expect(globalSingleton('cart', () => winner)).toBe(winner);
    expect(globalSingleton('cart', () => ({ who: 'second' }))).toBe(winner);
  });

  it('이름이 다르면 격리된다', async () => {
    const globalSingleton = await load();
    expect(globalSingleton('a', () => 1)).toBe(1);
    expect(globalSingleton('b', () => 2)).toBe(2);
  });

  it('모듈 그래프가 갈려도 같은 인스턴스를 준다', async () => {
    // 이게 이 헬퍼의 존재 이유다 — host 와 remote 는 @mfa/store 사본을 각자 가진다.
    const first = await load();
    const instance = first('cart', () => ({ id: 'only-one' }));

    vi.resetModules();
    const second = await load();

    expect(second('cart', () => ({ id: 'another' }))).toBe(instance);
  });

  it('레지스트리를 비우면 다시 만든다 (테스트 격리가 실제로 먹는지)', async () => {
    const globalSingleton = await load();
    const first = globalSingleton('cart', () => ({}));

    clearGlobalRegistries();

    expect(globalSingleton('cart', () => ({}))).not.toBe(first);
  });
});
