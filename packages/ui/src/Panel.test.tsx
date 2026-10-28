import '@testing-library/jest-dom/vitest';

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Panel } from './Panel';

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
