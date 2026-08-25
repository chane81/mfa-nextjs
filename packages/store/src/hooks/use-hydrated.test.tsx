import '@testing-library/jest-dom/vitest';

import { render, screen } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { useHydrated } from './use-hydrated';

/**
 * 이 훅이 만드는 경계가 `useCartLines` 의 전부다 — 커밋 전에는 서버가 넘긴 값,
 * 커밋 후에는 스토어.
 */
function Probe() {
  return <span data-testid="v">{String(useHydrated())}</span>;
}

describe('useHydrated', () => {
  it('서버 렌더에서는 false 다', () => {
    // getServerSnapshot 경로. 클라이언트 렌더로는 절대 도달하지 않는다.
    expect(renderToString(<Probe />)).toContain('>false<');
  });

  it('클라이언트 렌더에서는 true 다', () => {
    render(<Probe />);
    expect(screen.getByTestId('v')).toHaveTextContent('true');
  });

  it('구독 해제가 안전하다 — 바뀔 값이 없어 구독할 대상도 없다', () => {
    const { unmount } = render(<Probe />);
    expect(() => unmount()).not.toThrow();
  });
});
