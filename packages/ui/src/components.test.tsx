import '@testing-library/jest-dom/vitest';

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Badge, Button, ErrorBox, Panel, Skeleton } from './components';

/**
 * 이 패키지는 **CSS 를 만들지 않는다** — 클래스 이름만 내보낸다. 그래서 여기서 보는 것은
 * "어떻게 보이나" 가 아니라 "약속한 클래스와 CSS 변수를 실제로 내보내는가" 다.
 */

describe('Panel', () => {
  it('origin 라벨을 항상 보여준다', () => {
    render(
      <Panel origin="remote-cart">
        <p>내용</p>
      </Panel>,
    );

    expect(screen.getByText('remote-cart')).toBeInTheDocument();
    expect(screen.getByText('내용')).toBeInTheDocument();
  });

  it('originHue 를 CSS 변수로 내려보낸다', () => {
    // 런타임 값이라 클래스로 굳힐 수 없다. `remote-boundary` 유틸리티가 이 변수를 읽는다.
    const { container } = render(
      <Panel origin="remote-cart" originHue={330}>
        <p>내용</p>
      </Panel>,
    );

    expect(
      container.querySelector('section')!.style.getPropertyValue('--hue'),
    ).toBe('330');
  });

  it('originHue 기본값은 210 이다', () => {
    const { container } = render(
      <Panel origin="host">
        <p>내용</p>
      </Panel>,
    );

    expect(
      container.querySelector('section')!.style.getPropertyValue('--hue'),
    ).toBe('210');
  });

  it('title 이 없으면 제목 자리를 만들지 않는다', () => {
    render(
      <Panel origin="host">
        <p>내용</p>
      </Panel>,
    );
    expect(screen.queryByRole('heading')).toBeNull();
  });

  it('title 이 있으면 h2 로 낸다', () => {
    render(
      <Panel origin="host" title="장바구니">
        <p>내용</p>
      </Panel>,
    );
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(
      '장바구니',
    );
  });

  it('actions 를 헤더에 그대로 넣는다', () => {
    render(
      <Panel origin="host" actions={<button type="button">비우기</button>}>
        <p>내용</p>
      </Panel>,
    );
    expect(screen.getByRole('button', { name: '비우기' })).toBeInTheDocument();
  });

  it('className 을 기본 클래스에 더한다 — 대체하지 않는다', () => {
    const { container } = render(
      <Panel origin="host" className="mt-4">
        <p>내용</p>
      </Panel>,
    );

    const section = container.querySelector('section')!;
    expect(section).toHaveClass('remote-boundary');
    expect(section).toHaveClass('mt-4');
  });

  it('section 으로 감싼다 — remote 경계가 문서 구조에도 남는다', () => {
    const { container } = render(
      <Panel origin="host">
        <p>내용</p>
      </Panel>,
    );
    expect(container.querySelector('section')).not.toBeNull();
  });
});

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

describe('Skeleton', () => {
  it('라벨을 그대로 보여준다', () => {
    render(<Skeleton label="cart/CartPanel 불러오는 중" />);
    expect(screen.getByText('cart/CartPanel 불러오는 중')).toBeInTheDocument();
  });
});

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
