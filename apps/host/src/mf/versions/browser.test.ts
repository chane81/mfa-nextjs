import { MF_FILES } from '@mfa/remote-config';
import { describe, expect, it, vi } from 'vitest';

import {
  REMOTE_VERSIONS_GLOBAL,
  injectedEntry,
  injectionScript,
} from './browser';

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

/**
 * 브라우저가 하는 일을 그대로 한다 — 인라인 스크립트를 실행하고 `window` 에 남은 것을 집는다.
 * 이 파일은 node 환경에서 돌아 `window` 가 없으므로 인자로 넘긴다.
 */
function evaluate(script: string): unknown {
  const window: Record<string, unknown> = {};
  new Function('window', script)(window);
  return window[REMOTE_VERSIONS_GLOBAL];
}

/**
 * 이 seam 의 계약은 "직렬화 → 인라인 스크립트 → 역직렬화" 왕복이다.
 * 한쪽만 시험하면 **필드 이름이 어긋나도 양쪽 테스트가 다 초록**이고, 증상은
 * 에러가 아니라 버전 없는 폴백 엔트리로 조용히 붙는 것이다(G-1).
 */
describe('injectionScript ↔ injectedEntry 왕복', () => {
  const ENTRIES = {
    catalog: {
      version: 't1abc',
      entry: `https://catalog.example.com/vt1abc/${MF_FILES.webManifest}`,
    },
    cart: {
      version: 't2def',
      entry: `https://cart.example.com/vt2def/${MF_FILES.webManifest}`,
    },
  } as const;

  it('심은 것을 그대로 되읽는다', () => {
    // 브라우저가 하는 일과 같다 — 스크립트를 실행하고 전역에서 읽는다.
    vi.stubGlobal(REMOTE_VERSIONS_GLOBAL, evaluate(injectionScript(ENTRIES)));

    expect(injectedEntry('catalog')).toEqual(ENTRIES.catalog);
    expect(injectedEntry('cart')?.entry).toBe(ENTRIES.cart.entry);
  });

  it('항목이 빠진 remote 는 없는 채로 왕복한다', () => {
    vi.stubGlobal(
      REMOTE_VERSIONS_GLOBAL,
      evaluate(injectionScript({ catalog: ENTRIES.catalog })),
    );

    expect(injectedEntry('catalog')?.version).toBe('t1abc');
    expect(injectedEntry('cart')).toBeUndefined();
  });

  it('`<` 를 이스케이프해 스크립트를 조기 종료시키지 않는다', () => {
    // 지금 값으로는 닿을 수 없는 경로지만, 문자열을 만드는 유일한 자리라 방어도 여기 있다.
    const script = injectionScript({
      catalog: { version: 'x', entry: 'https://e.example.com/</script>' },
    });

    expect(script).not.toContain('</script>');
    expect(script).toContain('\\u003c');
  });
});
