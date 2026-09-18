import { MF_FILES, REACT_REQUIRED_VERSION } from '@mfa/remote-config';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { clearGlobalRegistries } from '@mfa/utils/test/globals';

import { SHARED_PROBES } from './react-modules';
import { REMOTE_VERSIONS_GLOBAL } from '../versions/browser';

/**
 * MF 런타임 **초기화**의 계약.
 *
 * ## 왜 여기에 테스트가 필요한가 — seam 이 한 칸 위에 있었다
 *
 * `react-modules.ts` 의 정규화 프로브에는 테스트가 있었지만 이 파일에는 없었다. 그런데
 * 이 저장소가 실제로 기록한 사고는 정규화 규칙 안이 아니라 **"그 규칙이 다섯 개 전부에
 * 똑같이 입혀졌는가"** 쪽에 있다 — `index.ts` 주석이 직접 적어 뒀듯 "손으로 다섯 번
 * 반복하면 하나만 다르게 적혀도 그 모듈만 조용히 싱글턴에서 빠진다. 증상은 훅이 깨지는
 * 것이고 원인은 설정 한 글자다."
 *
 * 그래서 순수 함수가 아니라 **`init()` 이 실제로 받은 인자**를 본다. 그게 MF 런타임에
 * 넘어가는 유일한 값이고, 여기가 틀리면 화면에서만 터진다.
 */
const { init, federationLoadRemote, loadRemoteModuleOnServer } = vi.hoisted(
  () => ({
    init: vi.fn(),
    federationLoadRemote: vi.fn(),
    loadRemoteModuleOnServer: vi.fn(),
  }),
);

vi.mock('@module-federation/runtime', () => ({
  init,
  loadRemote: federationLoadRemote,
}));
vi.mock('./server', () => ({ loadRemoteModuleOnServer }));

const CATALOG_ORIGIN = 'https://catalog.example.com';
const CART_ORIGIN = 'https://cart.example.com';

beforeEach(() => {
  clearGlobalRegistries();
  vi.resetModules();
  init.mockReset();
  federationLoadRemote.mockReset();
  loadRemoteModuleOnServer.mockReset();
  federationLoadRemote.mockResolvedValue({ default: () => null });
  vi.stubEnv('REMOTE_CATALOG_PUBLIC_URL', CATALOG_ORIGIN);
  vi.stubEnv('REMOTE_CART_PUBLIC_URL', CART_ORIGIN);
  vi.stubEnv(
    'MFA_REMOTE_WEB_ENTRIES',
    JSON.stringify({
      catalog: `${CATALOG_ORIGIN}/${MF_FILES.webManifest}`,
      cart: `${CART_ORIGIN}/${MF_FILES.webManifest}`,
    }),
  );
});

const load = () => import('./index');

/** `init()` 이 딱 한 번 받은 설정 */
const initArg = () =>
  init.mock.calls[0]?.[0] as {
    name: string;
    remotes: { name: string; entry: string }[];
    shared: Record<
      string,
      { version: string; scope: string; shareConfig: object }
    >;
  };

describe('shared 설정', () => {
  it('다섯 모듈이 전부 같은 싱글턴 설정으로 올라간다', async () => {
    // 하나라도 빠지거나 설정이 갈리면 그 모듈만 싱글턴에서 빠지고,
    // 증상은 `Invalid hook call` 이라 원인이 설정이라는 힌트가 없다.
    const { loadRemoteModule } = await load();
    await loadRemoteModule('catalog/ProductGrid');

    const { shared } = initArg();
    expect(Object.keys(shared).sort()).toEqual(
      Object.keys(SHARED_PROBES).sort(),
    );

    for (const [id, entry] of Object.entries(shared)) {
      expect(entry, id).toMatchObject({
        scope: 'default',
        shareConfig: {
          singleton: true,
          requiredVersion: REACT_REQUIRED_VERSION,
        },
      });
      expect(entry.version, id).toBe(shared.react!.version);
    }
  });

  it('`react-dom/client` 을 빠뜨리지 않는다', async () => {
    // 이 항목이 빠지면 catalog(Vite)가 bridge 단계에서 죽는다(#RUNTIME-015).
    // 8차에 한 번 오진해서 실제로 뺐던 자리라 이름을 박아 둔다.
    const { loadRemoteModule } = await load();
    await loadRemoteModule('catalog/ProductGrid');

    expect(initArg().shared).toHaveProperty(['react-dom/client']);
  });
});

describe('remotes 엔트리', () => {
  it('심어준 값이 없으면 폴백 엔트리로 초기화한다', async () => {
    const { loadRemoteModule } = await load();
    await loadRemoteModule('catalog/ProductGrid');

    expect(initArg().remotes).toEqual([
      { name: 'catalog', entry: `${CATALOG_ORIGIN}/${MF_FILES.webManifest}` },
      { name: 'cart', entry: `${CART_ORIGIN}/${MF_FILES.webManifest}` },
    ]);
  });

  it('서버가 심어준 엔트리가 있으면 그쪽을 쓴다', async () => {
    // 이게 뒤집히면 브라우저가 서버 마크업과 **다른 빌드**를 hydrate 한다.
    // 배포에서는 폴백 주소가 404 라 `Failed to fetch` 로만 보인다.
    vi.stubGlobal(REMOTE_VERSIONS_GLOBAL, {
      catalog: {
        version: 't9zzz',
        entry: `${CATALOG_ORIGIN}/vt9zzz/${MF_FILES.webManifest}`,
      },
    });
    const { loadRemoteModule } = await load();
    await loadRemoteModule('catalog/ProductGrid');

    expect(initArg().remotes).toContainEqual({
      name: 'catalog',
      entry: `${CATALOG_ORIGIN}/vt9zzz/${MF_FILES.webManifest}`,
    });
    // 심어준 값이 없는 remote 는 폴백 그대로 — remote 마다 독립이다
    expect(initArg().remotes).toContainEqual({
      name: 'cart',
      entry: `${CART_ORIGIN}/${MF_FILES.webManifest}`,
    });
  });

  it('여러 번 불러도 초기화는 한 번이다', async () => {
    const { loadRemoteModule } = await load();
    await loadRemoteModule('catalog/ProductGrid');
    await loadRemoteModule('cart/CartBadge');

    expect(init).toHaveBeenCalledTimes(1);
  });
});

describe('loadRemoteModule', () => {
  it('같은 모듈은 프라미스를 재사용한다', async () => {
    const { loadRemoteModule } = await load();
    const first = loadRemoteModule('catalog/ProductGrid');
    const second = loadRemoteModule('catalog/ProductGrid');

    expect(first).toBe(second);
    await first;
    expect(federationLoadRemote).toHaveBeenCalledTimes(1);
  });

  it('빈 모듈이면 무엇이 비었는지 말하고 던진다', async () => {
    // MF 는 못 찾은 모듈에 `null` 을 준다. 그대로 흘리면 렌더 시점에
    // "undefined 를 컴포넌트로 쓴다" 는 엉뚱한 에러가 난다.
    federationLoadRemote.mockResolvedValue(null);
    const { loadRemoteModule } = await load();

    await expect(loadRemoteModule('catalog/ProductGrid')).rejects.toThrow(
      'catalog/ProductGrid',
    );
  });

  it('서버에서는 node 번들 로더로 간다', async () => {
    // 같은 호출이 실행 환경에 따라 두 경로로 갈리는 것이 이 파일의 존재 이유다.
    vi.stubGlobal('window', undefined);
    loadRemoteModuleOnServer.mockResolvedValue({ default: () => null });
    const { loadRemoteModule } = await load();

    await loadRemoteModule('catalog/ProductGrid');

    expect(loadRemoteModuleOnServer).toHaveBeenCalledWith(
      'catalog/ProductGrid',
    );
    expect(federationLoadRemote).not.toHaveBeenCalled();
    expect(init).not.toHaveBeenCalled();
  });
});
