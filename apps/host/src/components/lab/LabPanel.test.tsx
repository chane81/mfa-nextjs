import '@testing-library/jest-dom/vitest';

import { MF_FILES } from '@mfa/remote-config';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { clearGlobalRegistries } from '@tests/helpers/globals';

import { formatKst } from '@/lib/format-time';

import { LAB_MODES, LAB_ORDER } from './modes';

/**
 * 세 모드를 **같은 내용**으로 렌더해 비교하는 실험 패널. 다른 건 라우트 세그먼트 설정뿐이라,
 * 화면에서 갈리는 건 두 시각(서버 렌더 · 브라우저)뿐이어야 한다.
 */
/**
 * `CatalogSection` 이 `useRouter()` 로 상세 이동을 잡는다 — host 가 라우팅을 소유하고
 * remote 는 콜백만 받는 구조(ADR-013)의 host 쪽 끝이다. App Router 컨텍스트가 없으면
 * `invariant expected app router to be mounted` 로 죽으므로 여기서 세운다.
 */
const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  usePathname: () => '/lab',
}));

const loadRemoteModule = vi.fn();
vi.mock('@/mf/runtime', () => ({
  loadRemoteModule: (id: string) => loadRemoteModule(id),
  REMOTE_ENTRIES: {
    catalog: 'https://catalog.example.com/mf-manifest.json',
    cart: 'https://cart.example.com/mf-manifest.json',
  },
}));

const RENDERED_AT = '2026-01-02T03:04:05.000Z';

beforeEach(() => {
  clearGlobalRegistries();
  vi.resetModules();
  loadRemoteModule.mockReset();
  loadRemoteModule.mockReturnValue(new Promise(() => {}));
  vi.stubEnv('REMOTE_CATALOG_PUBLIC_URL', 'https://catalog.example.com');
  vi.stubEnv('REMOTE_CART_PUBLIC_URL', 'https://cart.example.com');
  vi.stubEnv(
    'MFA_REMOTE_WEB_ENTRIES',
    JSON.stringify({
      catalog: `https://catalog.example.com/${MF_FILES.webManifest}`,
      cart: `https://cart.example.com/${MF_FILES.webManifest}`,
    }),
  );
});

const load = async () => (await import('./LabPanel')).LabPanel;

describe('HydrationStamp', () => {
  it('마운트 전에는 대기 문구를 보여준다', async () => {
    // 초기 렌더에서 시각을 읽으면 hydration mismatch 다.
    const { renderToString } = await import('react-dom/server');
    const { HydrationStamp } = await import('./HydrationStamp');

    expect(renderToString(<HydrationStamp />)).toContain('hydration 대기…');
  });

  it('마운트 후 브라우저 시각을 채운다', async () => {
    const { HydrationStamp } = await import('./HydrationStamp');

    render(<HydrationStamp />);

    expect(screen.getByTestId('hydrated-at').textContent).toMatch(
      /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/,
    );
  });
});

describe('LabPanel', () => {
  it.each(LAB_ORDER)('%s 모드의 라벨과 설정을 그린다', async (mode) => {
    const LabPanel = await load();

    render(<LabPanel mode={mode} renderedAt={RENDERED_AT} />);

    expect(
      screen.getByRole('heading', { name: LAB_MODES[mode].label }),
    ).toBeInTheDocument();
    expect(screen.getByText(LAB_MODES[mode].segmentConfig)).toBeInTheDocument();
    expect(screen.getByText(LAB_MODES[mode].expect)).toBeInTheDocument();
    expect(screen.getByText(`/lab/${mode}`)).toBeInTheDocument();
  });

  it('모드 색을 CSS 변수로 내려보낸다', async () => {
    // 런타임 값이라 클래스로 굳힐 수 없다.
    const LabPanel = await load();

    const { container } = render(
      <LabPanel mode="isr" renderedAt={RENDERED_AT} />,
    );

    expect(
      container.querySelector('section')!.style.getPropertyValue('--hue'),
    ).toBe(String(LAB_MODES.isr.hue));
  });

  it('서버 렌더 시각은 화면에 KST, dateTime 에는 원본 ISO 로 남긴다', async () => {
    // 캐시가 걸리면 이 값이 얼어붙는다 — 그게 실험의 판별자다.
    const LabPanel = await load();

    render(<LabPanel mode="ssr" renderedAt={RENDERED_AT} />);

    const time = screen.getByTestId('rendered-at');
    expect(time.tagName).toBe('TIME');
    expect(time).toHaveAttribute('dateTime', RENDERED_AT);
    expect(time).toHaveTextContent(formatKst(RENDERED_AT));
  });

  it('두 시각을 나란히 둔다', async () => {
    const LabPanel = await load();

    render(<LabPanel mode="ssr" renderedAt={RENDERED_AT} />);

    expect(screen.getByText('서버 렌더 시각 (KST)')).toBeInTheDocument();
    expect(screen.getByText('브라우저 시각 (KST)')).toBeInTheDocument();
    expect(screen.getByTestId('hydrated-at')).toBeInTheDocument();
  });

  it('children 을 사이에 끼운다', async () => {
    const LabPanel = await load();

    render(
      <LabPanel mode="ssr" renderedAt={RENDERED_AT}>
        <p>모드별 추가 설명</p>
      </LabPanel>,
    );

    expect(screen.getByText('모드별 추가 설명')).toBeInTheDocument();
  });

  it('세 모드가 같은 remote 를 그린다 — 캐시 차이만 남기려는 설계다', async () => {
    /**
     * 로더 호출 횟수로는 못 본다. `RemoteComponent` 의 `lazyCache` 가 모듈 id + 버전으로
     * 캐시하므로 두 번째 모드부터는 로더가 아예 안 불린다 — 그게 정상 동작이다.
     * 그래서 "무엇을 그리려 했는가"를 스켈레톤 라벨로 확인한다.
     */
    const LabPanel = await load();

    for (const mode of LAB_ORDER) {
      const { unmount } = render(
        <LabPanel mode={mode} renderedAt={RENDERED_AT} />,
      );
      expect(
        screen.getByText('catalog remote 에서 상품 목록 불러오는 중…'),
      ).toBeInTheDocument();
      unmount();
    }

    expect(loadRemoteModule).toHaveBeenCalledWith('catalog/ProductGrid');
  });
});
