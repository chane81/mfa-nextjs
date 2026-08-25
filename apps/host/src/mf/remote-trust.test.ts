import { MF_FILES, versionedPath } from '@mfa/remote-config';
import { describe, expect, it, vi } from 'vitest';

import { generateSigningKeyPair, signPayload } from '@tests/helpers/signing';

import {
  allowedOrigins,
  assertAllowedOrigin,
  assertIntegrity,
  assertManifestSignature,
  assertSafeEntryPath,
  assertSafeVersion,
  computeIntegrity,
  integrityRequired,
  signatureRequired,
  signedPayload,
} from './remote-trust';

/**
 * host **서버**가 remote 코드를 받아 `new Function` 으로 실행한다. 여기가 그 앞을 막는
 * 세 겹(오리진 허용 목록 → 경로 형태 → 무결성·서명)이고, 앞의 것 없이는 뒤의 것도
 * 의미가 없다. Node 24 의 WebCrypto Ed25519 를 그대로 쓰므로 모킹이 없다.
 */

const ORIGINS = ['https://catalog.example.com', 'https://cart.example.com'];

describe('allowedOrigins', () => {
  it('설정이 없으면 기본값만 허용한다 — 기본이 이미 닫혀 있다', () => {
    vi.stubEnv('REMOTE_ALLOWED_ORIGINS', undefined);
    expect(allowedOrigins(ORIGINS)).toEqual(ORIGINS);
  });

  it('빈 문자열도 미설정으로 본다', () => {
    vi.stubEnv('REMOTE_ALLOWED_ORIGINS', '');
    expect(allowedOrigins(ORIGINS)).toEqual(ORIGINS);
  });

  it('콤마로 나누고 공백을 턴다', () => {
    vi.stubEnv(
      'REMOTE_ALLOWED_ORIGINS',
      ' https://a.example.com , https://b.example.com ',
    );
    expect(allowedOrigins(ORIGINS)).toEqual([
      'https://a.example.com',
      'https://b.example.com',
    ]);
  });

  it('빈 항목은 버린다 — 후행 콤마가 만든 빈 문자열이 오리진이 되면 안 된다', () => {
    vi.stubEnv('REMOTE_ALLOWED_ORIGINS', 'https://a.example.com,,');
    expect(allowedOrigins(ORIGINS)).toEqual(['https://a.example.com']);
  });

  it('경로 · 포트가 붙어도 오리진으로 정규화한다', () => {
    vi.stubEnv(
      'REMOTE_ALLOWED_ORIGINS',
      'https://a.example.com/some/path,http://b.example.com:8080/',
    );
    expect(allowedOrigins(ORIGINS)).toEqual([
      'https://a.example.com',
      'http://b.example.com:8080',
    ]);
  });

  it('설정하면 기본값을 대체한다 — 더하지 않는다', () => {
    vi.stubEnv('REMOTE_ALLOWED_ORIGINS', 'https://only.example.com');
    expect(allowedOrigins(ORIGINS)).toEqual(['https://only.example.com']);
  });

  it('해석할 수 없는 값이 섞이면 던진다 — 조용히 무시하지 않는다', () => {
    // 오타 하나 때문에 목록이 반쪽이 되면 "왜 어떤 remote 만 안 뜨지" 가 된다.
    vi.stubEnv('REMOTE_ALLOWED_ORIGINS', 'https://a.example.com,not a url');
    expect(() => allowedOrigins(ORIGINS)).toThrow();
  });
});

describe('assertAllowedOrigin', () => {
  it('허용 목록 안의 오리진은 통과한다', () => {
    expect(() =>
      assertAllowedOrigin(
        'catalog',
        `${ORIGINS[0]}/vt1/mf-server.cjs`,
        ORIGINS,
      ),
    ).not.toThrow();
  });

  it('허용 목록 밖이면 던진다', () => {
    // mf-version.json 은 remote 가 주는 값이다. 거기 담긴 경로를 그대로 믿으면
    // "다른 오리진에서 받아 실행하라" 는 지시를 그대로 따르게 된다.
    expect(() =>
      assertAllowedOrigin('catalog', 'https://evil.example.com/x.cjs', ORIGINS),
    ).toThrow(/허용 목록에 없습니다/);
  });

  it('포트가 다르면 다른 오리진이다', () => {
    expect(() =>
      assertAllowedOrigin(
        'cart',
        'https://cart.example.com:8443/x.cjs',
        ORIGINS,
      ),
    ).toThrow();
  });

  it('프로토콜이 다르면 다른 오리진이다', () => {
    expect(() =>
      assertAllowedOrigin('cart', 'http://cart.example.com/x.cjs', ORIGINS),
    ).toThrow();
  });

  it('하위 도메인은 허용되지 않는다', () => {
    expect(() =>
      assertAllowedOrigin('cart', 'https://a.cart.example.com/x.cjs', ORIGINS),
    ).toThrow();
  });

  it('URL 로 해석되지 않으면 그 사실을 말한다', () => {
    expect(() =>
      assertAllowedOrigin('cart', '/vt1/mf-server.cjs', ORIGINS),
    ).toThrow(/해석할 수 없습니다/);
  });

  it('허용 목록이 비면 아무것도 통과하지 못한다', () => {
    expect(() =>
      assertAllowedOrigin('cart', 'https://cart.example.com/x.cjs', []),
    ).toThrow();
  });
});

describe('assertSafeVersion', () => {
  it.each(['t1abc', 'tmsy012z5', '1.2.3', 'v1-rc.2', 'A0', 'a'.repeat(64)])(
    '%s 는 통과한다',
    (version) => {
      expect(() => assertSafeVersion('catalog', version)).not.toThrow();
    },
  );

  it('스크립트 태그를 빠져나가는 값을 막는다', () => {
    // 이 값은 RemoteVersionSync 가 인라인 스크립트로 심는다. 거기서 쓰는
    // JSON.stringify 는 < 와 / 를 이스케이프하지 않는다.
    expect(() =>
      assertSafeVersion('catalog', '1</script><script>alert(1)</script>'),
    ).toThrow(/허용되지 않습니다/);
  });

  it.each([
    ['빈 문자열', ''],
    ['공백 포함', 't1 abc'],
    ['슬래시', 't1/abc'],
    ['상위 경로', '..'],
    ['따옴표', 't1"abc'],
    ['홑따옴표', "t1'abc"],
    ['꺾쇠', 't1<abc'],
    ['선두가 점', '.hidden'],
    ['선두가 하이픈', '-abc'],
    ['선두가 밑줄', '_abc'],
    ['퍼센트', 't1%2e%2e'],
    ['개행', 't1\nabc'],
    ['한글', '버전1'],
  ])('%s 은 막는다', (_label, version) => {
    expect(() => assertSafeVersion('catalog', version)).toThrow();
  });

  it('65자부터 막는다', () => {
    expect(() => assertSafeVersion('catalog', 'a'.repeat(65))).toThrow();
  });

  it('에러 메시지에 원문을 길게 흘리지 않는다', () => {
    const long = `t${'0'.repeat(500)}<`;
    const message = (() => {
      try {
        assertSafeVersion('catalog', long);
        return '';
      } catch (error) {
        return (error as Error).message;
      }
    })();
    expect(message.length).toBeLessThan(200);
  });
});

describe('assertSafeEntryPath', () => {
  const ok = (path: string, version = 't1abc') =>
    assertSafeEntryPath('catalog', path, version);

  it('버전 디렉터리 안의 단일 파일만 허용한다', () => {
    expect(() => ok('/vt1abc/mf-server.cjs')).not.toThrow();
    expect(() => ok('/vt1abc/mf-manifest.json')).not.toThrow();
  });

  it('remote-config 가 만드는 경로가 그대로 통과한다', () => {
    // 이 둘이 갈라지면 정상 배포가 검증에서 막힌다.
    expect(() => ok(versionedPath(MF_FILES.ssrBundle, 't1abc'))).not.toThrow();
    expect(() =>
      ok(versionedPath(MF_FILES.webManifest, 't1abc')),
    ).not.toThrow();
  });

  it.each([
    ['절대 URL', 'https://evil.example.com/mf-server.cjs'],
    ['프로토콜 상대', '//evil.example.com/mf-server.cjs'],
    ['상위 경로 탈출', '/vt1abc/../../etc/passwd'],
    ['경로 중간의 ..', '/vt1abc/..%2fmf-server.cjs'],
    ['쿼리', '/vt1abc/mf-server.cjs?x=1'],
    ['프래그먼트', '/vt1abc/mf-server.cjs#x'],
    ['버전 불일치', '/vt9zzz/mf-server.cjs'],
    ['버전 디렉터리 없음', '/mf-server.cjs'],
    ['하위 디렉터리', '/vt1abc/nested/mf-server.cjs'],
    ['빈 파일명', '/vt1abc/'],
    ['접두사만 같은 버전', '/vt1abcd/mf-server.cjs'],
  ])('%s 은 막는다', (_label, path) => {
    expect(() => ok(path)).toThrow();
  });

  it('파일명 규칙을 벗어나면 파일명이 문제라고 말한다', () => {
    expect(() => ok('/vt1abc/mf server.cjs')).toThrow(
      /파일명이 허용되지 않습니다/,
    );
  });
});

describe('computeIntegrity · assertIntegrity', () => {
  const bytes = (text: string) =>
    new TextEncoder().encode(text).buffer as ArrayBuffer;

  it('SRI 형식으로 SHA-384 를 낸다', async () => {
    // 고정 벡터 — 알고리즘이나 인코딩이 바뀌면 여기서 걸린다.
    expect(await computeIntegrity(bytes('abc'))).toBe(
      'sha384-ywB1P0WjXou1oD1pmsZQBycsMqsO3tFjGotgWkP/W+2AhgcroefMI1i67KE0yCWn',
    );
  });

  it('빈 입력도 값을 낸다', async () => {
    expect(await computeIntegrity(bytes(''))).toMatch(
      /^sha384-[A-Za-z0-9+/]+=*$/,
    );
  });

  it('바이트가 한 글자만 달라도 값이 달라진다', async () => {
    expect(await computeIntegrity(bytes('abc'))).not.toBe(
      await computeIntegrity(bytes('abd')),
    );
  });

  it('공표 값과 같으면 통과한다', async () => {
    const expected = await computeIntegrity(bytes('bundle'));
    await expect(
      assertIntegrity('catalog', bytes('bundle'), expected),
    ).resolves.toBeUndefined();
  });

  it('다르면 양쪽을 잘라서 보여주며 던진다', async () => {
    const expected = await computeIntegrity(bytes('bundle'));
    await expect(
      assertIntegrity('catalog', bytes('tampered'), expected),
    ).rejects.toThrow(/무결성 불일치/);
  });

  it('공표 값이 없고 강제도 아니면 통과한다 (dev)', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('MF_REQUIRE_INTEGRITY', undefined);
    await expect(
      assertIntegrity('catalog', bytes('bundle'), undefined),
    ).resolves.toBeUndefined();
  });

  it('공표 값이 없고 강제면 dev 서버 힌트를 담아 던진다', async () => {
    // 로컬에서 이걸 만나는 경우는 대개 그 포트에 dev 서버가 떠 있는 것이다.
    vi.stubEnv('NODE_ENV', 'production');
    await expect(
      assertIntegrity('catalog', bytes('bundle'), undefined),
    ).rejects.toThrow(/dev 서버가 떠 있지 않은지/);
  });
});

describe('integrityRequired · signatureRequired 진리표', () => {
  it.each([
    ['production', undefined, true],
    ['production', '1', true],
    ['production', '0', false],
    ['development', undefined, false],
    ['development', '1', false],
    ['test', undefined, false],
  ] as const)(
    'NODE_ENV=%s MF_REQUIRE_INTEGRITY=%s → %s',
    (nodeEnv, flag, expected) => {
      vi.stubEnv('NODE_ENV', nodeEnv);
      vi.stubEnv('MF_REQUIRE_INTEGRITY', flag);
      expect(integrityRequired()).toBe(expected);
    },
  );

  it('서명은 명시적으로 켤 때만 강제된다 — 키 배포가 필요하다', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('MF_REQUIRE_SIGNATURE', undefined);
    expect(signatureRequired()).toBe(false);

    vi.stubEnv('MF_REQUIRE_SIGNATURE', '1');
    expect(signatureRequired()).toBe(true);

    vi.stubEnv('MF_REQUIRE_SIGNATURE', 'true');
    expect(signatureRequired()).toBe(false);
  });
});

describe('assertManifestSignature', () => {
  const payload = signedPayload({
    remote: 'catalog',
    version: 't1abc',
    ssrEntry: '/vt1abc/mf-server.cjs',
    webEntry: '/vt1abc/mf-manifest.json',
    ssrIntegrity: 'sha384-aaa',
    webIntegrity: 'sha384-bbb',
  });

  it('키가 없고 강제도 아니면 조용히 통과한다', async () => {
    vi.stubEnv('MF_REMOTE_PUBLIC_KEY', undefined);
    vi.stubEnv('MF_REQUIRE_SIGNATURE', undefined);
    await expect(
      assertManifestSignature('catalog', payload, undefined),
    ).resolves.toBeUndefined();
  });

  it('강제인데 키가 없으면 그 사실을 말한다', async () => {
    vi.stubEnv('MF_REMOTE_PUBLIC_KEY', undefined);
    vi.stubEnv('MF_REQUIRE_SIGNATURE', '1');
    await expect(
      assertManifestSignature('catalog', payload, 'sig'),
    ).rejects.toThrow(/MF_REMOTE_PUBLIC_KEY 가 없습니다/);
  });

  it('강제인데 서명이 없으면 던진다', async () => {
    const { publicKey } = generateSigningKeyPair();
    vi.stubEnv('MF_REMOTE_PUBLIC_KEY', publicKey);
    vi.stubEnv('MF_REQUIRE_SIGNATURE', '1');
    await expect(
      assertManifestSignature('catalog', payload, undefined),
    ).rejects.toThrow(/서명이 없습니다/);
  });

  it('강제가 아니면 서명이 없어도 통과한다', async () => {
    const { publicKey } = generateSigningKeyPair();
    vi.stubEnv('MF_REMOTE_PUBLIC_KEY', publicKey);
    vi.stubEnv('MF_REQUIRE_SIGNATURE', undefined);
    await expect(
      assertManifestSignature('catalog', payload, undefined),
    ).resolves.toBeUndefined();
  });

  it('올바른 서명은 통과한다', async () => {
    const { privateKey, publicKey } = generateSigningKeyPair();
    vi.stubEnv('MF_REMOTE_PUBLIC_KEY', publicKey);
    await expect(
      assertManifestSignature(
        'catalog',
        payload,
        signPayload(payload, privateKey),
      ),
    ).resolves.toBeUndefined();
  });

  it('다른 키로 만든 서명은 막는다 — 오리진이 털려도 여기서 걸린다', async () => {
    const attacker = generateSigningKeyPair();
    const ours = generateSigningKeyPair();
    vi.stubEnv('MF_REMOTE_PUBLIC_KEY', ours.publicKey);
    await expect(
      assertManifestSignature(
        'catalog',
        payload,
        signPayload(payload, attacker.privateKey),
      ),
    ).rejects.toThrow(/서명 검증 실패/);
  });

  it('페이로드가 한 글자만 바뀌어도 막는다', async () => {
    const { privateKey, publicKey } = generateSigningKeyPair();
    vi.stubEnv('MF_REMOTE_PUBLIC_KEY', publicKey);
    const signature = signPayload(payload, privateKey);

    await expect(
      assertManifestSignature('catalog', `${payload} `, signature),
    ).rejects.toThrow(/서명 검증 실패/);
  });
});

describe('서명 계약 라운드트립 — stamp(서명) ↔ host(검증)', () => {
  /**
   * 15차에 실제로 갈라졌던 자리다. `signedPayload` 로 SSOT 를 만들었지만 갈라짐을 잡는
   * 장치는 없었다. 여기서 **remote 빌드 파이프라인과 같은 방식으로 서명한 값**을
   * host 의 검증에 그대로 넣는다.
   */
  const fields = {
    remote: 'cart',
    version: 't1abc',
    ssrEntry: versionedPath(MF_FILES.ssrBundle, 't1abc'),
    webEntry: versionedPath(MF_FILES.webManifest, 't1abc'),
    ssrIntegrity: 'sha384-aaa',
    webIntegrity: 'sha384-bbb',
  };

  it('**실제 stamp 스크립트가** 서명한 것을 host 가 받아들인다', async () => {
    /**
     * 위 두 테스트는 `tests/helpers/signing.ts` 로 서명한다 — 그건 파이프라인을 **흉내낸**
     * 것이라 둘이 같이 틀려도 초록으로 통과할 수 있다. 여기서는 배포가 실제로 부르는
     * `scripts/stamp-remote-version.ts` 의 `signManifest` 를 그대로 태운다.
     */
    const { signManifest } = await import(
      '../../../../scripts/stamp-remote-version'
    );
    const { privateKey, publicKey } = generateSigningKeyPair();
    vi.stubEnv('MF_REMOTE_PUBLIC_KEY', publicKey);
    vi.stubEnv('MF_REQUIRE_SIGNATURE', '1');

    const signature = signManifest(fields, privateKey);

    await expect(
      assertManifestSignature('cart', signedPayload(fields), signature!),
    ).resolves.toBeUndefined();
  });

  it('파이프라인이 서명한 매니페스트를 host 가 받아들인다', async () => {
    const { privateKey, publicKey } = generateSigningKeyPair();
    vi.stubEnv('MF_REMOTE_PUBLIC_KEY', publicKey);
    vi.stubEnv('MF_REQUIRE_SIGNATURE', '1');

    const signature = signPayload(signedPayload(fields), privateKey);

    await expect(
      assertManifestSignature('cart', signedPayload(fields), signature),
    ).resolves.toBeUndefined();
  });

  it('필드 하나만 바꿔치기해도 검증이 실패한다', async () => {
    const { privateKey, publicKey } = generateSigningKeyPair();
    vi.stubEnv('MF_REMOTE_PUBLIC_KEY', publicKey);

    const signature = signPayload(signedPayload(fields), privateKey);
    const tampered = signedPayload({
      ...fields,
      ssrEntry: '/vt1abc/evil.cjs',
    });

    await expect(
      assertManifestSignature('cart', tampered, signature),
    ).rejects.toThrow(/서명 검증 실패/);
  });

  it('서명이 덮는 경로는 실제로 통과하는 경로다', () => {
    // 서명은 맞는데 경로 검증에서 막히면 배포가 통째로 서고, 원인이 안 보인다.
    expect(() =>
      assertSafeEntryPath('cart', fields.ssrEntry, fields.version),
    ).not.toThrow();
    expect(() =>
      assertSafeEntryPath('cart', fields.webEntry, fields.version),
    ).not.toThrow();
    expect(() => assertSafeVersion('cart', fields.version)).not.toThrow();
  });
});
