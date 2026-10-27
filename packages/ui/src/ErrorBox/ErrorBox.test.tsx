import '@testing-library/jest-dom/vitest';

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ErrorBox } from './ErrorBox';

describe('ErrorBox', () => {
  it('제목만 있으면 제목만 낸다', () => {
    const { container } = render(
      <ErrorBox title="remote 를 불러오지 못했습니다" />,
    );

    expect(
      screen.getByText('remote 를 불러오지 못했습니다'),
    ).toBeInTheDocument();
    expect(container.querySelector('code')).toBeNull();
  });

  it('detail 이 있으면 코드 블록으로 붙인다', () => {
    render(<ErrorBox title="실패" detail="ECONNREFUSED 127.0.0.1:3001" />);

    const detail = screen.getByText('ECONNREFUSED 127.0.0.1:3001');
    expect(detail.tagName).toBe('CODE');
    // 스택 트레이스가 한 줄로 뭉치면 읽을 수 없다.
    expect(detail).toHaveClass('whitespace-pre-wrap');
  });
});
