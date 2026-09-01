import { beforeEach, describe, expect, it, vi } from 'vitest';

import { clearGlobalRegistries } from '@tests/helpers/globals';

/**
 * Next 는 RSC 레이어와 SSR 레이어의 모듈 그래프를 분리한다 — 같은 파일이 두 번 평가되고
 * 모듈 스코프 변수는 두 벌이 된다. 이 헬퍼가 지키는 건 "그래도 셀은 하나" 다.
 */
beforeEach(() => {
  clearGlobalRegistries();
  vi.resetModules();
});

const load = async () => (await import('./cell')).globalCell;

describe('globalCell', () => {
  it('같은 이름은 create 를 한 번만 부른다', async () => {
    const globalCell = await load();
    const create = vi.fn(() => ({ n: 1 }));

    const first = globalCell('versions', create);
    const second = globalCell('versions', create);

    expect(create).toHaveBeenCalledTimes(1);
    expect(second).toBe(first);
  });

  it('가변 셀을 준다 — value 로 읽고 쓴다', async () => {
    // 객체를 돌려주는 이유는 `let` 을 공유할 수 없기 때문이다.
    const globalCell = await load();
    const cell = globalCell<Record<string, string>>('versions', () => ({}));

    cell.value = { catalog: 't1' };

    expect(
      globalCell<Record<string, string>>('versions', () => ({})).value,
    ).toEqual({
      catalog: 't1',
    });
  });

  it('이름이 다르면 격리된다', async () => {
    const globalCell = await load();
    globalCell('a', () => 1).value = 10;
    globalCell('b', () => 2).value = 20;

    expect(globalCell('a', () => 0).value).toBe(10);
    expect(globalCell('b', () => 0).value).toBe(20);
  });

  it('모듈 그래프가 갈려도 같은 셀을 준다', async () => {
    // 이게 존재 이유다 — RSC 레이어가 쓴 값을 SSR 레이어가 읽어야 한다.
    const first = await load();
    first<string | null>('versions', () => null).value = 't1abc';

    vi.resetModules();
    const second = await load();

    expect(second<string | null>('versions', () => null).value).toBe('t1abc');
  });

  it('먼저 도착한 쪽이 이긴다', async () => {
    const globalCell = await load();
    expect(globalCell('x', () => 'first').value).toBe('first');
    expect(globalCell('x', () => 'second').value).toBe('first');
  });

  it('falsy 값도 셀 안에 담긴다', async () => {
    // 셀 존재 여부를 값의 진위로 판정하면 0 · null 을 담는 순간 셀이 다시 생긴다.
    const globalCell = await load();
    const create = vi.fn(() => 0);

    globalCell('zero', create);
    globalCell('zero', create);

    expect(create).toHaveBeenCalledTimes(1);
  });
});
