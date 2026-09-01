import { MF_FILES } from '@mfa/remote-config';
import { describe, expect, it, vi } from 'vitest';

import { REMOTE_VERSIONS_GLOBAL, injectedEntry } from './browser';

/**
 * 서버가 심어준 값을 브라우저가 읽는 자리. 여기서 지키는 계약은 둘이다 —
 * **전역 이름이 심는 쪽과 같다**, 그리고 **값이 없으면 조용히 폴백한다**.
 *
 * 이름이 어긋나면 404 가 아니라 "전부 버전 없는 주소로 요청" 이라는 형태로 나타나서
 * (dev 에서는 그게 맞는 주소라 로컬에서 안 보인다) 배포본에서만 깨진다.
 */
const stubVersions = (value: unknown) =>
  vi.stubGlobal(REMOTE_VERSIONS_GLOBAL, value);

describe('injectedEntry', () => {
  it('심어준 값이 없으면 undefined', () => {
    expect(injectedEntry('catalog')).toBeUndefined();
  });

  it('remote 마다 자기 항목을 본다', () => {
    stubVersions({
      catalog: {
        version: 't1abc',
        entry: `https://catalog.example.com/vt1abc/${MF_FILES.webManifest}`,
      },
      cart: {
        version: 't2def',
        entry: `https://cart.example.com/vt2def/${MF_FILES.webManifest}`,
      },
    });

    expect(injectedEntry('catalog')?.version).toBe('t1abc');
    expect(injectedEntry('cart')?.entry).toBe(
      `https://cart.example.com/vt2def/${MF_FILES.webManifest}`,
    );
  });

  it('그 remote 항목만 없으면 undefined — 다른 remote 는 영향받지 않는다', () => {
    stubVersions({
      catalog: {
        version: 't1abc',
        entry: `https://catalog.example.com/vt1abc/${MF_FILES.webManifest}`,
      },
    });

    expect(injectedEntry('cart')).toBeUndefined();
    expect(injectedEntry('catalog')).toBeDefined();
  });
});

describe('전역 이름', () => {
  it('`RemoteVersionSync` 가 심는 이름과 같다', () => {
    // 이 상수를 양쪽이 같이 쓰는 것이 계약이다. 값이 바뀌면 심는 스크립트도 같이 바뀐다.
    expect(REMOTE_VERSIONS_GLOBAL).toBe('__MFA_REMOTE_VERSIONS__');
  });
});
