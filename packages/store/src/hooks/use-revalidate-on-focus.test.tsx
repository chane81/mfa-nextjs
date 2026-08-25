import '@testing-library/jest-dom/vitest';

import { act, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useRevalidateOnFocus } from './use-revalidate-on-focus';

/**
 * 쿠키에는 `storage` 이벤트가 없고 `cookieStore.onchange` 는 Chromium 전용이라,
 * 남는 경로가 **포커스 복귀 시점에 직접 다시 읽기**다.
 */
function Probe({ onFocus }: { onFocus: () => void }) {
  useRevalidateOnFocus(onFocus);
  return null;
}

/** jsdom 의 visibilityState 를 바꾼다 (읽기 전용 프로퍼티라 정의를 덮어쓴다) */
const setVisibility = (state: DocumentVisibilityState) => {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => state,
  });
};

const fire = (event: 'focus' | 'visibilitychange') => {
  act(() => {
    if (event === 'focus') window.dispatchEvent(new Event('focus'));
    else document.dispatchEvent(new Event('visibilitychange'));
  });
};

describe('useRevalidateOnFocus', () => {
  it('탭이 보이는 상태에서 focus 가 오면 콜백을 부른다', () => {
    setVisibility('visible');
    const onFocus = vi.fn();
    render(<Probe onFocus={onFocus} />);

    fire('focus');

    expect(onFocus).toHaveBeenCalledOnce();
  });

  it('visibilitychange 도 듣는다 — 탭 전환을 잡는다', () => {
    setVisibility('visible');
    const onFocus = vi.fn();
    render(<Probe onFocus={onFocus} />);

    fire('visibilitychange');

    expect(onFocus).toHaveBeenCalledOnce();
  });

  it('보이지 않는 상태면 부르지 않는다', () => {
    // visibilitychange 는 탭이 숨겨질 때도 발화한다.
    setVisibility('hidden');
    const onFocus = vi.fn();
    render(<Probe onFocus={onFocus} />);

    fire('visibilitychange');
    fire('focus');

    expect(onFocus).not.toHaveBeenCalled();
  });

  it('마운트만으로는 부르지 않는다', () => {
    setVisibility('visible');
    const onFocus = vi.fn();

    render(<Probe onFocus={onFocus} />);

    expect(onFocus).not.toHaveBeenCalled();
  });

  it('두 이벤트가 같이 오면 두 번 부른다 — 거르는 건 호출부 몫이다', () => {
    // 여기서는 "언제 부를지" 만 정한다. 중복 발화 억제는 useCartSync 의 원문 비교가 맡는다.
    setVisibility('visible');
    const onFocus = vi.fn();
    render(<Probe onFocus={onFocus} />);

    fire('focus');
    fire('visibilitychange');

    expect(onFocus).toHaveBeenCalledTimes(2);
  });

  it('언마운트하면 리스너를 뗀다', () => {
    setVisibility('visible');
    const onFocus = vi.fn();
    const { unmount } = render(<Probe onFocus={onFocus} />);

    unmount();
    fire('focus');
    fire('visibilitychange');

    expect(onFocus).not.toHaveBeenCalled();
  });

  it('콜백이 매 렌더 새로 와도 리스너를 다시 걸지 않는다', () => {
    // effect 의존성에 콜백을 넣으면 정체성이 바뀔 때마다 리스너를 떼었다 붙인다.
    setVisibility('visible');
    const add = vi.spyOn(window, 'addEventListener');

    /** 매 렌더 새 함수를 넘긴다 */
    function Rerendering() {
      useRevalidateOnFocus(() => undefined);
      return null;
    }

    const { rerender } = render(<Rerendering />);
    rerender(<Rerendering />);
    rerender(<Rerendering />);

    expect(add.mock.calls.filter(([type]) => type === 'focus')).toHaveLength(1);
    add.mockRestore();
  });

  it('항상 가장 최근 콜백을 부른다 (ref latest)', () => {
    setVisibility('visible');
    const first = vi.fn();
    const second = vi.fn();

    const { rerender } = render(<Probe onFocus={first} />);
    rerender(<Probe onFocus={second} />);

    fire('focus');

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledOnce();
  });
});
