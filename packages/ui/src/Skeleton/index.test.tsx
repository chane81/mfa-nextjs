import '@testing-library/jest-dom/vitest';

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Skeleton } from '.';

describe('Skeleton', () => {
  it('라벨을 그대로 보여준다', () => {
    render(<Skeleton label="cart/CartPanel 불러오는 중" />);
    expect(screen.getByText('cart/CartPanel 불러오는 중')).toBeInTheDocument();
  });
});
