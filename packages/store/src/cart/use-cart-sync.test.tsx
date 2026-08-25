import '@testing-library/jest-dom/vitest';

import { PRODUCTS } from '@mfa/contracts';
import { act, render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { clearGlobalRegistries } from '@tests/helpers/globals';

/**
 * 탭 사이에서 장바구니가 갈라지는 걸 막는다.
 *
 * 핵심은 **원문 비교**다. 없으면 포커스마다 `rehydrate()` 가 돌고, 내용이 같아도 새 배열
 * 참조가 생겨 화면이 매번 다시 그려진다.
 */
const A = PRODUCTS[0]!;
const B = PRODUCTS[1]!;

const clearCookies = () => {
  for (const part of document.cookie.split(/;\s*/)) {
    const name = part.split('=')[0];
    if (name) document.cookie = `${name}=; path=/; max-age=0`;
  }
};

const setVisibility = (state: DocumentVisibilityState) => {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => state,
  });
};

const focus = () => act(() => window.dispatchEvent(new Event('focus')));

beforeEach(() => {
  clearGlobalRegistries();
  clearCookies();
  vi.resetModules();
  setVisibility('visible');
});

/** 다른 탭이 쿠키를 바꾼 상황 */
const writeCookie = async (json: string) => {
  const { CART_COOKIE_NAME } = await import('./cookie-codec');
  document.cookie = `${CART_COOKIE_NAME}=${encodeURIComponent(json)}; path=/`;
};

const setup = async () => {
  const { useCartSync } = await import('./use-cart-sync');
  const { useCart } = await import('./create-store');
  const rehydrate = vi.spyOn(useCart.persist, 'rehydrate');

  function Probe() {
    useCartSync();
    return null;
  }

  return { Probe, useCart, rehydrate };
};

describe('기준선', () => {
  it('마운트 시점의 쿠키를 기준선으로 잡는다', async () => {
    // 스토어 복원이 이미 반영한 값이다. 이걸 안 잡으면 첫 포커스에서 "바뀌었다" 로 오판한다.
    await writeCookie(`[{"id":"${A.id}","q":1}]`);
    const { Probe, rehydrate } = await setup();

    render(<Probe />);
    focus();

    expect(rehydrate).not.toHaveBeenCalled();
  });

  it('쿠키가 없는 상태도 기준선이다 (null 과 undefined 를 구분한다)', async () => {
    // `undefined` = 아직 기준선을 안 잡았다, `null` = 쿠키가 없다. 둘을 섞으면
    // 쿠키 없이 시작한 탭이 첫 포커스마다 복원을 돈다.
    const { Probe, rehydrate } = await setup();

    render(<Probe />);
    focus();

    expect(rehydrate).not.toHaveBeenCalled();
  });

  it('마운트 전 포커스는 아무 일도 하지 않는다', async () => {
    const { rehydrate } = await setup();
    focus();
    expect(rehydrate).not.toHaveBeenCalled();
  });
});

describe('변경 감지', () => {
  it('다른 탭이 쿠키를 바꾸면 복원한다', async () => {
    const { Probe, useCart, rehydrate } = await setup();
    render(<Probe />);

    await writeCookie(`[{"id":"${B.id}","q":2}]`);
    focus();

    expect(rehydrate).toHaveBeenCalledOnce();
    expect(useCart.getState().lines).toEqual([
      expect.objectContaining({ productId: B.id, quantity: 2 }),
    ]);
  });

  it('원문이 같으면 복원을 건너뛴다', async () => {
    // 안 건너뛰면 내용이 같아도 새 배열 참조가 생겨 화면이 매번 다시 그려진다.
    await writeCookie(`[{"id":"${A.id}","q":1}]`);
    const { Probe, rehydrate } = await setup();
    render(<Probe />);

    focus();
    focus();
    focus();

    expect(rehydrate).not.toHaveBeenCalled();
  });

  it('한 번 반영한 값은 다음 포커스에서 다시 복원하지 않는다', async () => {
    const { Probe, rehydrate } = await setup();
    render(<Probe />);

    await writeCookie(`[{"id":"${B.id}","q":2}]`);
    focus();
    focus();

    expect(rehydrate).toHaveBeenCalledOnce();
  });

  it('쿠키가 지워진 것도 변경으로 보고 복원을 돌린다', async () => {
    /**
     * 다만 **상태는 비워지지 않는다.** persist 의 `rehydrate()` 는 저장소가 `null` 을
     * 주면 현재 상태를 그대로 둔다(zustand 5.0.15). 즉 다른 탭에서 쿠키를 지워도
     * 이 탭의 장바구니는 남는다.
     *
     * 이 훅이 막으려는 건 "낡은 상태가 남의 변경을 덮어쓰는 것" 이고, 쿠키가 사라진
     * 경우는 그 시나리오가 아니다 — 다음 쓰기에서 이 탭의 값이 다시 실린다.
     * 비우는 동작이 필요하면 `clear()` 를 부르는 쪽이 맞다.
     */
    await writeCookie(`[{"id":"${A.id}","q":1}]`);
    const { Probe, useCart, rehydrate } = await setup();
    render(<Probe />);

    clearCookies();
    focus();

    expect(rehydrate).toHaveBeenCalledOnce();
    expect(useCart.getState().lines).toEqual([
      expect.objectContaining({ productId: A.id }),
    ]);
  });

  it('탭이 보이지 않으면 확인하지 않는다', async () => {
    const { Probe, rehydrate } = await setup();
    render(<Probe />);

    await writeCookie(`[{"id":"${B.id}","q":2}]`);
    setVisibility('hidden');
    focus();

    expect(rehydrate).not.toHaveBeenCalled();
  });
});

describe('정규화 후 재기준선(reseed)', () => {
  it('복원이 쿠키를 정규화해도 다음 포커스에서 다시 돌지 않는다', async () => {
    /**
     * 복원은 값을 정규화한다(중복 병합 · 수량 클램프). 그 결과가 쿠키에 되쓰이면 원문이
     * 방금 읽은 것과 달라진다. 기준선을 다시 안 잡으면 포커스마다 "바뀌었다" 로 읽혀
     * `rehydrate()` 가 영원히 돈다.
     */
    const { Probe, rehydrate } = await setup();
    render(<Probe />);

    // 같은 상품 두 줄 — 복원하면 한 줄로 합쳐지고 쿠키 원문이 달라진다
    await writeCookie(`[{"id":"${A.id}","q":1},{"id":"${A.id}","q":2}]`);
    focus();
    expect(rehydrate).toHaveBeenCalledOnce();

    focus();
    focus();

    expect(rehydrate).toHaveBeenCalledOnce();
  });

  it('정규화 결과가 스토어에 반영된다', async () => {
    const { Probe, useCart } = await setup();
    render(<Probe />);

    await writeCookie(`[{"id":"${A.id}","q":1},{"id":"${A.id}","q":2}]`);
    focus();

    expect(useCart.getState().lines).toEqual([
      expect.objectContaining({ productId: A.id, quantity: 3 }),
    ]);
  });
});

describe('싱글턴', () => {
  it('기준선은 번들 경계를 넘어 하나다', async () => {
    // 모듈 스코프 변수로 두면 host·remote 사본마다 기준선이 생기고,
    // 한 번의 변경에 rehydrate 가 사본 수만큼 돈다.
    await writeCookie(`[{"id":"${A.id}","q":1}]`);
    const first = await setup();
    render(<first.Probe />);

    vi.resetModules();
    const second = await setup();
    render(<second.Probe />);

    focus();

    expect(second.rehydrate).not.toHaveBeenCalled();
  });
});
