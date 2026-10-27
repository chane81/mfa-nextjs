import '@testing-library/jest-dom/vitest';

import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Badge } from '.';

describe('Badge', () => {
  it('hue 를 CSS 변수로 내려보낸다', () => {
    const { container } = render(<Badge hue={45}>3</Badge>);
    expect(
      container.querySelector('span')!.style.getPropertyValue('--hue'),
    ).toBe('45');
  });

  it('hue 기본값은 210 이다', () => {
    const { container } = render(<Badge>3</Badge>);
    expect(
      container.querySelector('span')!.style.getPropertyValue('--hue'),
    ).toBe('210');
  });

  it('알약 모양이 무너지지 않게 줄바꿈을 막는다', () => {
    const { container } = render(<Badge>담긴 상품 3개</Badge>);
    expect(container.querySelector('span')).toHaveClass('whitespace-nowrap');
  });
});
