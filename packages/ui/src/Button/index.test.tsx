import '@testing-library/jest-dom/vitest';

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Button } from '.';

describe('Button', () => {
  it.each([
    ['primary', 'bg-accent'],
    ['ghost', 'bg-transparent'],
    ['danger', 'text-danger'],
  ] as const)('variant %s 는 완성된 클래스를 쓴다', (variant, expected) => {
    // ⚠️ `bg-${variant}` 처럼 조립하면 Tailwind 소스 스캔이 못 찾아 CSS 에서 조용히 빠진다.
    render(<Button variant={variant}>담기</Button>);
    expect(screen.getByRole('button')).toHaveClass(expected);
  });

  it('기본 variant 는 primary 다', () => {
    render(<Button>담기</Button>);
    expect(screen.getByRole('button')).toHaveClass('bg-accent');
  });

  it('기본 type 은 button 이다 — 폼 안에서 의도치 않게 제출되지 않는다', () => {
    render(<Button>담기</Button>);
    expect(screen.getByRole('button')).toHaveAttribute('type', 'button');
  });

  it('type 을 submit 으로 바꿀 수 있다', () => {
    render(<Button type="submit">보내기</Button>);
    expect(screen.getByRole('button')).toHaveAttribute('type', 'submit');
  });

  it('클릭하면 onClick 을 부른다', async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>담기</Button>);

    await userEvent.click(screen.getByRole('button'));

    expect(onClick).toHaveBeenCalledOnce();
  });

  it('disabled 면 클릭이 먹지 않는다', async () => {
    const onClick = vi.fn();
    render(
      <Button onClick={onClick} disabled>
        담기
      </Button>,
    );

    await userEvent.click(screen.getByRole('button'));

    expect(screen.getByRole('button')).toBeDisabled();
    expect(onClick).not.toHaveBeenCalled();
  });
});
