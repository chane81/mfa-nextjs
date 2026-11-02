import '@testing-library/jest-dom/vitest';

import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { RemoteBoundary } from './RemoteBoundary';

/**
 * 독립 배포는 곧 **독립 장애**다. remote 하나가 죽어도 host 는 살아야 한다.
 *
 * 주소는 **경계가 직접 고른다**(`pinnedEntry`). 그래서 여기서 모킹하는 것은
 * "런타임이 지금 이 remote 를 어느 주소로 부르나" 하나뿐이고, 에러 상자에 그 값이
 * 그대로 나오는지를 본다 — 호출부가 다른 주소를 넘길 수 있던 시절의 반대다.
 */
const { pinnedEntry } = vi.hoisted(() => ({ pinnedEntry: vi.fn() }));
vi.mock('../loader', () => ({ pinnedEntry }));

function Boom({ message }: { message: string }): never {
  throw new Error(message);
}

/** 배포에서 실제로 쓰이는 모양 — 버전이 박힌 불변 경로다. */
const CATALOG_ENTRY = 'https://catalog.example.com/vt9zzz/mf-manifest.json';

let error: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  // React 자신도 에러 경계에서 잡힌 예외를 콘솔에 찍는다.
  error = vi.spyOn(console, 'error').mockImplementation(() => {});
  pinnedEntry.mockReset();
  pinnedEntry.mockReturnValue(CATALOG_ENTRY);
});

const boundary = (children: React.ReactNode) =>
  render(<RemoteBoundary remoteName="catalog">{children}</RemoteBoundary>);

describe('RemoteBoundary', () => {
  it('정상일 때는 자식을 그대로 그린다', () => {
    boundary(<p>상품 목록</p>);
    expect(screen.getByText('상품 목록')).toBeInTheDocument();
  });

  it('자식이 던지면 host 를 살리고 에러 상자를 보여준다', () => {
    boundary(<Boom message="ECONNREFUSED" />);

    expect(
      screen.getByText("remote 'catalog' 를 불러오지 못했습니다"),
    ).toBeInTheDocument();
  });

  it('에러 상자에 entry 와 원본 메시지를 담는다', () => {
    boundary(<Boom message="ECONNREFUSED 127.0.0.1:3001" />);

    const detail = screen.getByText(/entry:/);
    expect(detail).toHaveTextContent(`entry: ${CATALOG_ENTRY}`);
    expect(detail).toHaveTextContent('ECONNREFUSED 127.0.0.1:3001');
    // 주소를 받는 게 아니라 이름으로 물어본다 — 호출부가 틀릴 자리가 없다.
    expect(pinnedEntry).toHaveBeenCalledWith('catalog');
  });

  it('정상 렌더에서는 주소를 묻지도 않는다', () => {
    // 행복한 경로는 주소를 알 필요가 없다. 에러 분기에서만 부른다.
    boundary(<p>상품 목록</p>);
    expect(pinnedEntry).not.toHaveBeenCalled();
  });

  it('무엇을 확인해야 하는지 알려준다', () => {
    boundary(<Boom message="실패" />);
    expect(screen.getByText(/remote dev 서버가 떠 있는지/)).toBeInTheDocument();
  });

  it('remote 이름과 함께 로그를 남긴다', () => {
    // 실제 서비스라면 여기서 에러 트래커로 보낸다.
    boundary(<Boom message="실패" />);

    expect(
      error.mock.calls.some((args: unknown[]) =>
        String(args[0]).includes("remote 'catalog' 로드 실패"),
      ),
    ).toBe(true);
  });

  it('remote 이름이 다르면 메시지도 다르다', () => {
    render(
      <RemoteBoundary remoteName="cart">
        <Boom message="실패" />
      </RemoteBoundary>,
    );

    expect(
      screen.getByText("remote 'cart' 를 불러오지 못했습니다"),
    ).toBeInTheDocument();
  });
});
