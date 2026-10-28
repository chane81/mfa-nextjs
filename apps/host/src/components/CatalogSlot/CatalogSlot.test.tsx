import '@testing-library/jest-dom/vitest';

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 카탈로그 필터를 주소에 남기는 자리. **remote 는 URL 을 모른다**(ADR-013) —
 * 그래서 이 파일이 host 쪽 끝이고, 여기서 검사할 것은 두 가지다.
 *
 *   주소 → 화면   손으로 고칠 수 있는 값이라 아는 카테고리만 통과시킨다
 *   화면 → 주소   `replace` 로 쓴다. 필터는 이동이 아니라 같은 화면의 상태다
 *
 * `CatalogSection` 은 remote 를 실제로 불러오므로 여기서는 대역으로 세운다.
 * 이 테스트의 관심사는 remote 렌더가 아니라 **URL 정책**이다.
 */
const replace = vi.fn();
let search = new URLSearchParams();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace, push: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => search,
}));

vi.mock('@/components/CatalogSection', () => ({
  CatalogSection: ({
    category,
    onCategoryChange,
  }: {
    category?: string;
    onCategoryChange?: (next: string) => void;
  }) => (
    <div>
      <span data-testid="category">{category}</span>
      <button type="button" onClick={() => onCategoryChange?.('audio')}>
        audio 로
      </button>
      <button type="button" onClick={() => onCategoryChange?.('all')}>
        all 로
      </button>
    </div>
  ),
}));

const load = async () => (await import('./CatalogSlot')).CatalogSlot;

beforeEach(() => {
  replace.mockClear();
  search = new URLSearchParams();
  vi.resetModules();
});

describe('CatalogSlot — 필터를 주소에 남긴다', () => {
  it('주소의 카테고리를 그대로 내려보낸다', async () => {
    search = new URLSearchParams('category=keyboard');
    const CatalogSlot = await load();

    render(<CatalogSlot />);

    expect(screen.getByTestId('category')).toHaveTextContent('keyboard');
  });

  it('모르는 값은 all 로 떨어뜨린다', async () => {
    // 주소창은 사용자가 손으로 고친다. 그대로 remote 에 넘기면 빈 목록이 된다.
    search = new URLSearchParams('category=없는카테고리');
    const CatalogSlot = await load();

    render(<CatalogSlot />);

    expect(screen.getByTestId('category')).toHaveTextContent('all');
  });

  it('선택을 push 가 아니라 replace 로 쓴다', async () => {
    // push 로 쌓으면 뒤로 가기가 "이전 화면" 이 아니라 "이전 필터" 가 된다.
    const CatalogSlot = await load();
    render(<CatalogSlot />);

    await userEvent.click(screen.getByRole('button', { name: 'audio 로' }));

    expect(replace).toHaveBeenCalledWith('/?category=audio', { scroll: false });
  });

  it('all 은 주소에서 뺀다', async () => {
    // 기본값이라 남길 이유가 없다. 남기면 공유 링크가 지저분해지기만 한다.
    search = new URLSearchParams('category=audio');
    const CatalogSlot = await load();
    render(<CatalogSlot />);

    await userEvent.click(screen.getByRole('button', { name: 'all 로' }));

    expect(replace).toHaveBeenCalledWith('/', { scroll: false });
  });

  it('다른 쿼리는 건드리지 않는다', async () => {
    search = new URLSearchParams('q=키보드&category=audio');
    const CatalogSlot = await load();
    render(<CatalogSlot />);

    await userEvent.click(screen.getByRole('button', { name: 'all 로' }));

    expect(replace).toHaveBeenCalledWith('/?q=%ED%82%A4%EB%B3%B4%EB%93%9C', {
      scroll: false,
    });
  });
});
