import { MF_FILES, REMOTE_NAMES } from '@mfa/remote-config';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * ⚠️ 이 모듈은 **import 시점에** env 를 읽고 `new URL()` 로 오리진을 조립한다.
 * 그래서 env 를 바꾸는 테스트는 `vi.stubEnv` → `vi.resetModules()` → `await import()`
 * 순서여야 한다. 순서를 어기면 앞 테스트가 구운 값을 그대로 본다.
 *
 * 이 모듈은 `versions/server` · `loader/server` · `loader` · `RemoteComponent` 가 전부
 * 전이 의존하므로, 여기가 오염되면 그쪽 테스트가 같이 흔들린다.
 */
beforeEach(() => {
  vi.resetModules();
});

const load = () => import('./index');

describe('byRemote', () => {
  it('REMOTE_NAMES 를 순회해 표를 만든다', async () => {
    const { byRemote } = await load();
    expect(byRemote((remote) => remote.toUpperCase())).toEqual({
      catalog: 'CATALOG',
      cart: 'CART',
    });
  });

  it('remote 이름이 이 파일에 박혀 있지 않다', async () => {
    const { byRemote } = await load();
    expect(Object.keys(byRemote((r) => r)).sort()).toEqual(
      [...REMOTE_NAMES].sort(),
    );
  });
});

describe('SSR_ENTRIES — 서버 전용, env 를 직접 읽는다', () => {
  it('env 가 없으면 dev 오리진으로 떨어진다', async () => {
    vi.stubEnv('REMOTE_CATALOG_PUBLIC_URL', undefined);
    vi.stubEnv('REMOTE_CART_PUBLIC_URL', undefined);
    const { SSR_ENTRIES } = await load();

    expect(SSR_ENTRIES.catalog).toBe(
      `http://localhost:3001/${MF_FILES.ssrBundle}`,
    );
    expect(SSR_ENTRIES.cart).toBe(
      `http://localhost:3002/${MF_FILES.ssrBundle}`,
    );
  });

  it('env 를 주면 그 오리진을 쓴다', async () => {
    vi.stubEnv('REMOTE_CATALOG_PUBLIC_URL', 'https://catalog.example.com/');
    const { SSR_ENTRIES } = await load();

    expect(SSR_ENTRIES.catalog).toBe(
      `https://catalog.example.com/${MF_FILES.ssrBundle}`,
    );
  });

  it('파일명을 여기서 조립하지 않는다', async () => {
    // 경로 문자열이 이 파일에 생기면 번들러별 디렉터리 규칙이 계약에 샌다.
    const { SSR_ENTRIES } = await load();
    expect(SSR_ENTRIES.catalog.endsWith(`/${MF_FILES.ssrBundle}`)).toBe(true);
  });
});

describe('WEB_ENTRIES — next.config.ts 가 구워 넣은 값을 먼저 본다', () => {
  it('주입값이 있으면 그걸 쓴다', async () => {
    vi.stubEnv(
      'MFA_REMOTE_WEB_ENTRIES',
      JSON.stringify({ catalog: 'https://cdn.example.com/c/mf-manifest.json' }),
    );
    const { WEB_ENTRIES } = await load();

    expect(WEB_ENTRIES.catalog).toBe(
      'https://cdn.example.com/c/mf-manifest.json',
    );
  });

  it('주입에 없는 remote 는 env 에서 파생한다', async () => {
    vi.stubEnv(
      'MFA_REMOTE_WEB_ENTRIES',
      JSON.stringify({ catalog: 'https://x/y' }),
    );
    vi.stubEnv('REMOTE_CART_PUBLIC_URL', 'https://cart.example.com');
    const { WEB_ENTRIES } = await load();

    expect(WEB_ENTRIES.cart).toBe(
      `https://cart.example.com/${MF_FILES.webManifest}`,
    );
  });

  it('주입값이 빈 문자열이면 파생값으로 떨어진다', async () => {
    vi.stubEnv('MFA_REMOTE_WEB_ENTRIES', JSON.stringify({ catalog: '' }));
    vi.stubEnv('REMOTE_CATALOG_PUBLIC_URL', 'https://catalog.example.com');
    const { WEB_ENTRIES } = await load();

    expect(WEB_ENTRIES.catalog).toBe(
      `https://catalog.example.com/${MF_FILES.webManifest}`,
    );
  });

  it('JSON 파싱 실패는 조용히 삼킨다 — Next 밖에서 로드될 수 있다', async () => {
    // tsc · 스크립트가 이 모듈을 import 하는 경우가 있다. 거기서 던지면
    // 원인과 무관한 자리에서 죽는다.
    vi.stubEnv('MFA_REMOTE_WEB_ENTRIES', '{깨진 JSON');
    vi.stubEnv('REMOTE_CATALOG_PUBLIC_URL', 'https://catalog.example.com');
    const { WEB_ENTRIES } = await load();

    expect(WEB_ENTRIES.catalog).toBe(
      `https://catalog.example.com/${MF_FILES.webManifest}`,
    );
  });

  it('주입값이 비어 있어도 모듈이 로드된다', async () => {
    vi.stubEnv('MFA_REMOTE_WEB_ENTRIES', undefined);
    await expect(load()).resolves.toBeDefined();
  });
});

describe('WEB_ORIGINS — 브라우저에서도 맞는 값', () => {
  it('WEB_ENTRIES 에서 오리진만 뽑는다', async () => {
    vi.stubEnv(
      'MFA_REMOTE_WEB_ENTRIES',
      JSON.stringify({
        catalog: 'https://cdn.example.com/catalog/mf-manifest.json',
        cart: 'https://cart.example.com/mf-manifest.json',
      }),
    );
    const { WEB_ORIGINS } = await load();

    expect(WEB_ORIGINS).toEqual({
      catalog: 'https://cdn.example.com',
      cart: 'https://cart.example.com',
    });
  });

  it('SSR_ENTRIES 가 아니라 WEB_ENTRIES 를 본다', async () => {
    // 출처를 바꾸면 브라우저에서 조용히 localhost 로 떨어진다 — 그러면
    // 서버가 만든 HTML 과 값이 갈려 하이드레이션까지 어긋난다.
    vi.stubEnv(
      'MFA_REMOTE_WEB_ENTRIES',
      JSON.stringify({ catalog: 'https://baked.example.com/mf-manifest.json' }),
    );
    vi.stubEnv('REMOTE_CATALOG_PUBLIC_URL', 'https://server-only.example.com');
    const { WEB_ORIGINS, SSR_ENTRIES } = await load();

    expect(WEB_ORIGINS.catalog).toBe('https://baked.example.com');
    expect(SSR_ENTRIES.catalog).toContain('server-only.example.com');
  });

  it('주입값이 URL 이 아니면 모듈 로드가 실패한다', async () => {
    // 조용히 넘어가면 이 값으로 만든 스타일시트 주소가 전부 깨진 채로 배포된다.
    vi.stubEnv(
      'MFA_REMOTE_WEB_ENTRIES',
      JSON.stringify({ catalog: '/상대/경로/mf-manifest.json' }),
    );
    await expect(load()).rejects.toThrow();
  });
});

describe('ssrOrigin — SSR 엔트리에서 오리진만 뽑는다', () => {
  it('설정된 remote 오리진을 그대로 준다', async () => {
    vi.stubEnv('REMOTE_CATALOG_PUBLIC_URL', 'https://catalog.example.com');
    const { ssrOrigin } = await load();
    expect(ssrOrigin('catalog')).toBe('https://catalog.example.com');
  });

  it('SSR_ENTRIES 는 그 오리진의 버전 없는 엔트리다', async () => {
    vi.stubEnv('REMOTE_CATALOG_PUBLIC_URL', 'https://catalog.example.com');
    const { SSR_ENTRIES } = await load();
    expect(SSR_ENTRIES.catalog).toBe(
      `https://catalog.example.com/${MF_FILES.ssrBundle}`,
    );
  });
});
