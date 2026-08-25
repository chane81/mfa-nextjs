import {
  MF_FILES,
  MF_SSR_BUNDLE,
  REMOTE_LIST,
  REMOTE_NAMES,
  REMOTES,
  assertRemoteName,
  devOrigin,
  publicOrigin,
  signedPayload,
  ssrBundleUrl,
  stylesPath,
  versionedPath,
  webManifestUrl,
} from './index';
import { describe, expect, it, vi } from 'vitest';

describe('배치 상수', () => {
  it('MF_FILES.ssrBundle 은 MF_SSR_BUNDLE 을 조립한 값이다', () => {
    // 셋이 어긋날 수 없다는 게 이 상수의 존재 이유다.
    expect(MF_FILES.ssrBundle).toBe(
      `${MF_SSR_BUNDLE.name}${MF_SSR_BUNDLE.extension}`,
    );
    // host 서버가 new Function 으로 평가하므로 CJS 여야 한다.
    expect(MF_SSR_BUNDLE.extension).toBe('.cjs');
  });

  it('REMOTE_NAMES 는 REMOTES 의 키 선언 순서를 그대로 따른다', () => {
    /**
     * `REMOTE_NAMES` 는 이제 `Object.keys(REMOTES)` 다. 문자열 키의 열거 순서는 삽입
     * 순서로 스펙에 고정돼 있지만(정수 인덱스 키가 아니므로 재정렬 안 된다), 배열
     * 리터럴로 적던 때보다 **눈에 안 보이는 계약**이 됐다. 여기서 붙잡는다.
     *
     * 순서가 중요한 이유: `REMOTE_LIST` 가 이 순서를 따르고, `wait-for-remotes` 와
     * `next.config.ts` 가 그걸 순회한다.
     */
    expect([...REMOTE_NAMES]).toEqual(Object.keys(REMOTES));
    expect(REMOTE_LIST.map((r) => r.name)).toEqual([...REMOTE_NAMES]);
  });

  it('REMOTE_LIST 항목은 키를 name 으로 되붙인다', () => {
    // 이름의 원본은 `REMOTES` 의 키 하나뿐이다. 되붙이는 자리가 어긋나면
    // 순회하는 쪽(next.config.ts · wait-for-remotes)이 엉뚱한 remote 를 가리킨다.
    for (const entry of REMOTE_LIST) {
      expect(entry).toEqual({ name: entry.name, ...REMOTES[entry.name] });
    }
  });

  it('devPort 는 remote 마다 다르다', () => {
    // 겹치면 dev 대기 스크립트가 영영 안 뜨는 remote 를 기다린다.
    const ports = REMOTE_LIST.map((r) => r.devPort);
    expect(new Set(ports).size).toBe(ports.length);
  });

  it('env 키 이름은 remote 마다 다르다', () => {
    const keys = REMOTE_LIST.map((r) => r.env.publicUrl);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('assertRemoteName', () => {
  it('유효한 이름은 그대로 돌려준다', () => {
    expect(assertRemoteName('catalog')).toBe('catalog');
    expect(assertRemoteName('cart')).toBe('cart');
  });

  it('모르는 이름은 가능한 값을 담아 throw 한다', () => {
    expect(() => assertRemoteName('checkout')).toThrow(
      /알 수 없는 remote 'checkout'.*catalog, cart/,
    );
  });

  it('빈 문자열도 거른다', () => {
    expect(() => assertRemoteName('')).toThrow();
  });
});

describe('publicOrigin', () => {
  it('env 가 없으면 devOrigin 으로 떨어진다', () => {
    vi.stubEnv('REMOTE_CATALOG_PUBLIC_URL', undefined);
    expect(publicOrigin('catalog')).toBe(devOrigin('catalog'));
    expect(devOrigin('catalog')).toBe('http://localhost:3001');
    expect(devOrigin('cart')).toBe('http://localhost:3002');
  });

  it('빈 문자열도 devOrigin 으로 떨어진다 (?? 가 아니라 || 인 이유)', () => {
    // Dockerfile 에서 ARG 를 값 없이 선언하면 빈 문자열로 도착한다.
    // ?? 였다면 그걸 유효한 설정으로 받아 new URL("") 에서 터진다.
    vi.stubEnv('REMOTE_CART_PUBLIC_URL', '');
    expect(publicOrigin('cart')).toBe('http://localhost:3002');
  });

  it('후행 슬래시는 몇 개든 전부 지운다', () => {
    vi.stubEnv('REMOTE_CATALOG_PUBLIC_URL', 'https://catalog.example.com///');
    expect(publicOrigin('catalog')).toBe('https://catalog.example.com');
  });

  it('중간 슬래시는 건드리지 않는다', () => {
    vi.stubEnv('REMOTE_CATALOG_PUBLIC_URL', 'https://cdn.example.com/catalog/');
    expect(publicOrigin('catalog')).toBe('https://cdn.example.com/catalog');
  });
});

describe('URL 조립 — 호출부가 파일명을 적지 않는다', () => {
  it('webManifestUrl · ssrBundleUrl 은 오리진 + MF_FILES 다', () => {
    vi.stubEnv('REMOTE_CART_PUBLIC_URL', 'https://cart.example.com/');
    expect(webManifestUrl('cart')).toBe(
      `https://cart.example.com/${MF_FILES.webManifest}`,
    );
    expect(ssrBundleUrl('cart')).toBe(
      `https://cart.example.com/${MF_FILES.ssrBundle}`,
    );
  });
});

describe('versionedPath', () => {
  it('버전이 있으면 /v<version>/ 아래로 보낸다', () => {
    expect(versionedPath('style.css', 't1abc')).toBe('/vt1abc/style.css');
  });

  it('버전이 없으면(dev) 루트 경로다', () => {
    expect(versionedPath('style.css')).toBe('/style.css');
    expect(versionedPath('style.css', null)).toBe('/style.css');
  });

  it('빈 문자열 버전도 루트 경로다 (falsy 판정)', () => {
    // 버전을 못 읽었을 때 `/v/style.css` 같은 주소가 나가면 안 된다.
    expect(versionedPath('style.css', '')).toBe('/style.css');
  });

  it('오리진은 절대 붙이지 않는다 — 브라우저 번들이 쓰는 값이다', () => {
    expect(versionedPath('style.css', 'v1').startsWith('/')).toBe(true);
  });

  it('stylesPath 는 versionedPath 에 MF_FILES.styles 를 위임한다', () => {
    expect(stylesPath('t1abc')).toBe(versionedPath(MF_FILES.styles, 't1abc'));
    expect(stylesPath()).toBe(`/${MF_FILES.styles}`);
  });
});

describe('signedPayload', () => {
  const fields = {
    remote: 'cart',
    version: 't1abc',
    ssrEntry: '/vt1abc/mf-server.cjs',
    webEntry: '/vt1abc/mf-manifest.json',
    ssrIntegrity: 'sha384-aaa',
    webIntegrity: 'sha384-bbb',
  };

  it('필드 순서를 고정한다', () => {
    // 서명하는 쪽(scripts/stamp-remote-version.ts)과 검증하는 쪽
    // (apps/host/src/mf/remote-trust.ts)이 이 배열을 각자 적고 있었고 실제로 갈라졌다.
    // 순서가 바뀌면 매니페스트는 멀쩡히 만들어지는데 host 검증만 실패한다.
    expect(signedPayload(fields)).toBe(
      '["cart","t1abc","/vt1abc/mf-server.cjs","/vt1abc/mf-manifest.json","sha384-aaa","sha384-bbb"]',
    );
  });

  it('무결성 필드가 없으면 빈 문자열로 정규화한다', () => {
    // undefined 를 그대로 넣으면 JSON.stringify 가 null 로 바꿔 양쪽 값이 갈린다.
    const { ssrIntegrity: _s, webIntegrity: _w, ...bare } = fields;
    expect(signedPayload(bare)).toBe(
      '["cart","t1abc","/vt1abc/mf-server.cjs","/vt1abc/mf-manifest.json","",""]',
    );
  });

  it('필드 하나만 달라도 페이로드가 달라진다', () => {
    expect(signedPayload({ ...fields, version: 't1abd' })).not.toBe(
      signedPayload(fields),
    );
  });

  it('객체 키 순서와 무관하게 같은 페이로드를 만든다', () => {
    const shuffled = {
      webIntegrity: fields.webIntegrity,
      version: fields.version,
      remote: fields.remote,
      ssrIntegrity: fields.ssrIntegrity,
      webEntry: fields.webEntry,
      ssrEntry: fields.ssrEntry,
    };
    expect(signedPayload(shuffled)).toBe(signedPayload(fields));
  });
});
