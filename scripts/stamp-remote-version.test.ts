import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { MF_FILES, versionedPath } from '@mfa/remote-config';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { generateSigningKeyPair } from '@tests/helpers/signing';

import {
  buildPayload,
  integrity,
  signManifest,
  staleVersionDirs,
} from './stamp-remote-version';

/**
 * remote 빌드를 "현재 버전" 으로 공표하는 스크립트.
 *
 * 여기서 보는 것은 셋이다 — 무결성 값의 형식, 서명이 host 쪽 검증과 맞물리는지,
 * 그리고 **정리 대상의 경계**. 마지막이 틀리면 방금 만든 버전이 지워지거나,
 * 반대로 배포와 무관한 디렉터리까지 `rm -rf` 를 맞는다.
 */
let dist: string;

beforeEach(() => {
  dist = mkdtempSync(join(tmpdir(), 'mfa-stamp-'));
});

afterEach(() => {
  rmSync(dist, { recursive: true, force: true });
});

/** 버전 디렉터리 하나를 만든다 */
const makeVersion = (version: string) => {
  const dir = join(dist, `v${version}`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, MF_FILES.ssrBundle), `// ${version}`, 'utf8');
  writeFileSync(join(dir, MF_FILES.webManifest), `{"v":"${version}"}`, 'utf8');
  return dir;
};

describe('integrity', () => {
  it('SRI 형식으로 SHA-384 를 낸다', () => {
    writeFileSync(join(dist, 'a.js'), 'abc', 'utf8');

    // host 의 computeIntegrity 와 같은 알고리즘·인코딩이어야 한다.
    expect(integrity(join(dist, 'a.js'))).toBe(
      'sha384-ywB1P0WjXou1oD1pmsZQBycsMqsO3tFjGotgWkP/W+2AhgcroefMI1i67KE0yCWn',
    );
  });

  it('내용이 다르면 값도 다르다', () => {
    writeFileSync(join(dist, 'a.js'), 'abc', 'utf8');
    writeFileSync(join(dist, 'b.js'), 'abd', 'utf8');

    expect(integrity(join(dist, 'a.js'))).not.toBe(
      integrity(join(dist, 'b.js')),
    );
  });
});

describe('buildPayload', () => {
  it('경로는 remote-config 가 만드는 것과 같다', () => {
    // 갈라지면 정상 배포가 host 의 경로 검증에서 막힌다.
    const dir = makeVersion('t1abc');

    const payload = buildPayload('catalog', 't1abc', dir);

    expect(payload.ssrEntry).toBe(versionedPath(MF_FILES.ssrBundle, 't1abc'));
    expect(payload.webEntry).toBe(versionedPath(MF_FILES.webManifest, 't1abc'));
  });

  it('두 산출물의 무결성을 각각 담는다', () => {
    const dir = makeVersion('t1abc');

    const payload = buildPayload('catalog', 't1abc', dir);

    expect(payload.ssrIntegrity).toBe(integrity(join(dir, MF_FILES.ssrBundle)));
    expect(payload.webIntegrity).toBe(
      integrity(join(dir, MF_FILES.webManifest)),
    );
    expect(payload.ssrIntegrity).not.toBe(payload.webIntegrity);
  });

  it('remote 이름과 버전을 그대로 싣는다', () => {
    const dir = makeVersion('t1abc');
    expect(buildPayload('cart', 't1abc', dir)).toMatchObject({
      remote: 'cart',
      version: 't1abc',
    });
  });
});

describe('signManifest', () => {
  it('키가 없으면 서명하지 않는다', () => {
    const dir = makeVersion('t1abc');
    expect(
      signManifest(buildPayload('catalog', 't1abc', dir), undefined),
    ).toBeNull();
    expect(signManifest(buildPayload('catalog', 't1abc', dir), '')).toBeNull();
  });

  it('키가 있으면 base64 서명을 만든다', () => {
    // host 쪽 검증과 실제로 맞물리는지는 `apps/host/src/mf/remote-trust.test.ts` 가 본다 —
    // 그쪽 프로그램에만 WebCrypto 타입(DOM lib)이 있다.
    const { privateKey } = generateSigningKeyPair();
    const dir = makeVersion('t1abc');

    const signature = signManifest(
      buildPayload('catalog', 't1abc', dir),
      privateKey,
    );

    expect(signature).toMatch(/^[A-Za-z0-9+/]+=*$/);
  });

  it('페이로드가 바뀌면 서명도 바뀐다', () => {
    const { privateKey } = generateSigningKeyPair();
    const dir = makeVersion('t1abc');
    const payload = buildPayload('catalog', 't1abc', dir);

    expect(signManifest(payload, privateKey)).not.toBe(
      signManifest({ ...payload, version: 't2def' }, privateKey),
    );
  });
});

describe('staleVersionDirs — 정리 경계', () => {
  it('현재 버전만 남기고 전부 지운다', () => {
    // 빌드 dist 는 방금 만든 한 벌만 들고 있으면 된다. 롤백용 옛 버전은
    // 서빙 볼륨이 REMOTE_KEEP_VERSIONS 만큼 들고 있다.
    makeVersion('t1');
    makeVersion('t2');
    makeVersion('t3');

    expect(staleVersionDirs(dist, 't3')).toEqual(['vt1', 'vt2']);
  });

  it('버전이 하나뿐이면 아무것도 지우지 않는다', () => {
    makeVersion('t1');

    expect(staleVersionDirs(dist, 't1')).toEqual([]);
  });

  it('현재 버전은 몇 번째로 만들어졌든 지우지 않는다', () => {
    // 롤백으로 옛 버전을 다시 공표한 상황이다.
    makeVersion('t1');
    makeVersion('t2');
    makeVersion('t3');

    expect(staleVersionDirs(dist, 't1')).not.toContain('vt1');
  });

  it('SSR 번들이 없는 껍데기도 지운다', () => {
    // 빌드가 중간에 죽어 남은 것이다. 남길 게 최신 한 벌뿐이라 셀 이유가 없다.
    makeVersion('t1');
    mkdirSync(join(dist, 'vbroken'), { recursive: true });

    expect(staleVersionDirs(dist, 't1')).toEqual(['vbroken']);
  });

  it('v 로 시작하지 않는 디렉터리는 건드리지 않는다', () => {
    // mf-version.json 옆의 assets 같은 것들이다. rm -rf 대상이라 경계가 중요하다.
    makeVersion('t1');
    makeVersion('t2');
    mkdirSync(join(dist, 'assets'), { recursive: true });

    expect(staleVersionDirs(dist, 't2')).toEqual(['vt1']);
  });

  it('버전 디렉터리가 없으면 빈 목록이다', () => {
    expect(staleVersionDirs(dist, 't1')).toEqual([]);
  });
});
