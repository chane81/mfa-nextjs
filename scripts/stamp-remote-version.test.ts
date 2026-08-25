import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { MF_FILES, versionedPath } from '@mfa/remote-config';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { generateSigningKeyPair } from '@tests/helpers/signing';

import {
  KEEP_VERSIONS,
  buildPayload,
  integrity,
  signManifest,
  staleVersionDirs,
} from './stamp-remote-version';

/**
 * remote 빌드를 "현재 버전" 으로 공표하는 스크립트.
 *
 * 여기서 보는 것은 셋이다 — 무결성 값의 형식, 서명이 host 쪽 검증과 맞물리는지,
 * 그리고 **오래된 버전 정리의 경계**. 마지막이 틀리면 롤백 대상이 사라지거나
 * dist 가 계속 부푼다.
 */
let dist: string;

beforeEach(() => {
  dist = mkdtempSync(join(tmpdir(), 'mfa-stamp-'));
});

afterEach(() => {
  rmSync(dist, { recursive: true, force: true });
});

/** 버전 디렉터리 하나를 만든다. `mtime` 으로 나이를 정한다 */
const makeVersion = (version: string, ageSeconds: number) => {
  const dir = join(dist, `v${version}`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, MF_FILES.ssrBundle), `// ${version}`, 'utf8');
  writeFileSync(join(dir, MF_FILES.webManifest), `{"v":"${version}"}`, 'utf8');

  const when = new Date(Date.parse('2026-01-01T00:00:00Z') - ageSeconds * 1000);
  utimesSync(dir, when, when);
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
    const dir = makeVersion('t1abc', 0);

    const payload = buildPayload('catalog', 't1abc', dir);

    expect(payload.ssrEntry).toBe(versionedPath(MF_FILES.ssrBundle, 't1abc'));
    expect(payload.webEntry).toBe(versionedPath(MF_FILES.webManifest, 't1abc'));
  });

  it('두 산출물의 무결성을 각각 담는다', () => {
    const dir = makeVersion('t1abc', 0);

    const payload = buildPayload('catalog', 't1abc', dir);

    expect(payload.ssrIntegrity).toBe(integrity(join(dir, MF_FILES.ssrBundle)));
    expect(payload.webIntegrity).toBe(
      integrity(join(dir, MF_FILES.webManifest)),
    );
    expect(payload.ssrIntegrity).not.toBe(payload.webIntegrity);
  });

  it('remote 이름과 버전을 그대로 싣는다', () => {
    const dir = makeVersion('t1abc', 0);
    expect(buildPayload('cart', 't1abc', dir)).toMatchObject({
      remote: 'cart',
      version: 't1abc',
    });
  });
});

describe('signManifest', () => {
  it('키가 없으면 서명하지 않는다', () => {
    const dir = makeVersion('t1abc', 0);
    expect(
      signManifest(buildPayload('catalog', 't1abc', dir), undefined),
    ).toBeNull();
    expect(signManifest(buildPayload('catalog', 't1abc', dir), '')).toBeNull();
  });

  it('키가 있으면 base64 서명을 만든다', () => {
    // host 쪽 검증과 실제로 맞물리는지는 `apps/host/src/mf/remote-trust.test.ts` 가 본다 —
    // 그쪽 프로그램에만 WebCrypto 타입(DOM lib)이 있다.
    const { privateKey } = generateSigningKeyPair();
    const dir = makeVersion('t1abc', 0);

    const signature = signManifest(
      buildPayload('catalog', 't1abc', dir),
      privateKey,
    );

    expect(signature).toMatch(/^[A-Za-z0-9+/]+=*$/);
  });

  it('페이로드가 바뀌면 서명도 바뀐다', () => {
    const { privateKey } = generateSigningKeyPair();
    const dir = makeVersion('t1abc', 0);
    const payload = buildPayload('catalog', 't1abc', dir);

    expect(signManifest(payload, privateKey)).not.toBe(
      signManifest({ ...payload, version: 't2def' }, privateKey),
    );
  });
});

describe('staleVersionDirs — 정리 경계', () => {
  it('보존 개수 이하면 아무것도 지우지 않는다', () => {
    makeVersion('t1', 300);
    makeVersion('t2', 200);
    makeVersion('t3', 100);

    expect(staleVersionDirs(dist, 't3')).toEqual([]);
  });

  it('넘치면 오래된 것부터 지운다', () => {
    makeVersion('t1', 500);
    makeVersion('t2', 400);
    makeVersion('t3', 300);
    makeVersion('t4', 200);
    makeVersion('t5', 100);

    // 다섯 개 중 셋을 남긴다 → 가장 오래된 둘
    expect(staleVersionDirs(dist, 't5')).toEqual(['vt1', 'vt2']);
  });

  it('현재 버전은 아무리 오래돼도 지우지 않는다', () => {
    // 롤백으로 옛 버전을 다시 공표한 상황이다.
    makeVersion('t1', 500);
    makeVersion('t2', 400);
    makeVersion('t3', 300);
    makeVersion('t4', 200);
    makeVersion('t5', 100);

    expect(staleVersionDirs(dist, 't1')).not.toContain('vt1');
  });

  it('보존 개수를 바꿀 수 있다', () => {
    makeVersion('t1', 300);
    makeVersion('t2', 200);
    makeVersion('t3', 100);

    expect(staleVersionDirs(dist, 't3', 1)).toEqual(['vt1', 'vt2']);
    expect(staleVersionDirs(dist, 't3', 0)).toEqual(['vt1', 'vt2']);
  });

  it('기본 보존 개수는 3 이다 — 0이면 롤백이 불가능하다', () => {
    expect(KEEP_VERSIONS).toBe(3);
  });

  it('SSR 번들이 없는 디렉터리는 버전으로 세지 않는다', () => {
    // 빌드가 중간에 죽어 남은 껍데기다. 이걸 세면 멀쩡한 버전이 대신 지워진다.
    makeVersion('t1', 400);
    makeVersion('t2', 300);
    makeVersion('t3', 200);
    mkdirSync(join(dist, 'vbroken'), { recursive: true });

    expect(staleVersionDirs(dist, 't3')).toEqual([]);
  });

  it('v 로 시작하지 않는 디렉터리는 건드리지 않는다', () => {
    makeVersion('t1', 400);
    makeVersion('t2', 300);
    makeVersion('t3', 200);
    makeVersion('t4', 100);
    mkdirSync(join(dist, 'assets'), { recursive: true });

    expect(staleVersionDirs(dist, 't4')).toEqual(['vt1']);
  });

  it('버전 디렉터리가 없으면 빈 목록이다', () => {
    expect(staleVersionDirs(dist, 't1')).toEqual([]);
  });
});
