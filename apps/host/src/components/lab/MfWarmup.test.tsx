import { describe, expect, it, vi } from 'vitest';

/**
 * warm 의 `lazy` 캐시가 **자라지 않는지** 본다.
 *
 * 웹훅이 주는 nonce 는 요청마다 유일하다(`api/mf-revalidate` 가 `버전-Date.now()`).
 * 키를 그대로 쌓으면 warm 한 번마다 엔트리가 하나씩 늘고, 축출이 없는 데다 host 서버는
 * 장수 프로세스라 영영 줄지 않는다. 코드만 읽어서는 그 상태로 돌아간 걸 알기 어렵고
 * 증상은 한참 뒤 메모리로만 나타나서, 여기서 크기를 직접 본다.
 *
 * `@mfa/contracts/remote` 는 생성물(`dist`)을 가리키므로 모킹한다 — 이 파일이 보는 것은
 * 계약의 내용이 아니라 캐시의 크기다. `mf/loader` 도 같은 이유로 모킹한다(로더를 태우면
 * MF 런타임이 깨어난다).
 */
vi.mock('@mfa/contracts/remote', () => ({
  MODULE_IDS: ['catalog/ProductGrid', 'cart/CartWidget'] as const,
}));

vi.mock('@/mf/config', () => ({
  WEB_ENTRIES: { catalog: 'https://catalog.test/mf-manifest.json' },
}));

vi.mock('@/mf/loader', () => ({
  loadRemoteModule: vi.fn(async () => ({ default: () => null })),
}));

vi.mock('@/mf/components/RemoteComponent', () => ({
  remoteCacheKey: (id: string, reloadKey?: string) =>
    `${id}@v${reloadKey ? `#${reloadKey}` : ''}`,
}));

const { warmCacheSize, warmLoader } = await import('./MfWarmup');

describe('warm 의 lazy 캐시', () => {
  it('nonce 가 달라도 remote 당 한 칸만 쓴다', () => {
    for (let i = 0; i < 50; i++) {
      warmLoader('catalog', `1.0.0-${i}`);
    }

    expect(warmCacheSize()).toBe(1);
  });

  it('nonce 가 바뀌면 새 컴포넌트를 주고, 같으면 같은 것을 준다', () => {
    // 같은 프라미스를 재사용해야 React 가 서스펜스를 무한히 다시 시도하지 않는다.
    // 그 성질은 nonce 가 같은 동안에만 필요하다.
    const first = warmLoader('cart', 'nonce-a');
    const again = warmLoader('cart', 'nonce-a');
    const next = warmLoader('cart', 'nonce-b');

    expect(again).toBe(first);
    expect(next).not.toBe(first);
  });
});
