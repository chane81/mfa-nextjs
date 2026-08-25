import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { fakeResponse } from '@tests/helpers/http';

import { createHandler } from './serve-remote-dist';

/**
 * CDN 을 흉내내는 정적 서버의 요청 핸들러.
 *
 * 가장 중요한 건 **경로 탈출 방어**다 — 이 서버는 remote 의 dist 를 통째로 공개하므로,
 * `..` 하나가 통과하면 컨테이너 파일시스템이 열린다.
 */
let dist: string;

beforeAll(() => {
  dist = mkdtempSync(join(tmpdir(), 'mfa-serve-dist-'));
  writeFileSync(join(dist, 'mf-manifest.json'), '{"name":"catalog"}', 'utf8');
  writeFileSync(join(dist, 'style.css'), 'body{}', 'utf8');
  writeFileSync(join(dist, 'index.html'), '<html></html>', 'utf8');
  // 캐시 헤더가 **경로 형태**로만 갈리는지 보려고 이름만 비슷한 두 디렉터리를 둔다
  for (const dir of ['vzzz', 'version', 'static']) {
    mkdirSync(join(dist, dir), { recursive: true });
    writeFileSync(join(dist, dir, 'style.css'), 'body{}', 'utf8');
  }
  mkdirSync(join(dist, 'vt1abc'), { recursive: true });
  writeFileSync(
    join(dist, 'vt1abc', 'mf-server.cjs'),
    'module.exports={}',
    'utf8',
  );
  // dist 밖에 두는 미끼 — 탈출에 성공하면 이게 나온다
  writeFileSync(join(dist, '..', 'mfa-secret.txt'), '비밀', 'utf8');
});

afterAll(() => {
  rmSync(dist, { recursive: true, force: true });
  rmSync(join(dist, '..', 'mfa-secret.txt'), { force: true });
});

/**
 * 핸들러를 한 번 태우고 응답이 **끝날 때까지** 기다린다.
 *
 * 기다리지 않으면 파일 읽기가 테스트 종료 뒤에 이어지고, `afterAll` 이 임시 디렉터리를
 * 지우는 순간 ENOENT 가 처리되지 않은 예외로 튄다(실측).
 */
const request = async (url: string) => {
  const res = fakeResponse();
  createHandler(dist)(
    { url } as IncomingMessage,
    res as unknown as ServerResponse,
  );
  await res.done;
  return res;
};

describe('정상 응답', () => {
  it('dist 안의 파일을 내려준다', async () => {
    const res = await request('/mf-manifest.json');
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('application/json; charset=utf-8');
  });

  it('확장자로 MIME 을 정한다', async () => {
    expect((await request('/style.css')).headers['content-type']).toBe(
      'text/css; charset=utf-8',
    );
    expect(
      (await request('/vt1abc/mf-server.cjs')).headers['content-type'],
    ).toBe('application/javascript; charset=utf-8');
  });

  it('모르는 확장자는 octet-stream 이다', async () => {
    writeFileSync(join(dist, 'notes.bin'), 'x', 'utf8');
    expect((await request('/notes.bin')).headers['content-type']).toBe(
      'application/octet-stream',
    );
  });

  it('디렉터리는 index.html 로 떨어진다', async () => {
    expect((await request('/')).headers['content-type']).toBe(
      'text/html; charset=utf-8',
    );
  });

  it('쿼리스트링을 떼고 판단한다', async () => {
    expect((await request('/style.css?v=1')).statusCode).toBe(200);
  });

  it('교차 출처를 허용한다 — host(3000) 가 받아간다', async () => {
    expect(
      (await request('/mf-manifest.json')).headers[
        'access-control-allow-origin'
      ],
    ).toBe('*');
  });

  it('없는 파일은 404 다', async () => {
    const res = await request('/없는파일.js');
    expect(res.statusCode).toBe(404);
    expect(res.body).toBe('not found');
  });
});

describe('캐시 헤더 — 버전 경로만 불변이다', () => {
  it('/v<ver>/ 아래는 immutable 이다', async () => {
    expect(
      (await request('/vt1abc/mf-server.cjs')).headers['cache-control'],
    ).toBe('public, max-age=31536000, immutable');
  });

  it('루트 파일은 no-store 다 — "지금 버전이 뭔지" 는 항상 최신이어야 한다', async () => {
    expect((await request('/mf-manifest.json')).headers['cache-control']).toBe(
      'no-store',
    );
  });

  it('경로 형태로만 판정한다 — 파일명 목록에 기대지 않는다', async () => {
    /**
     * 이 파일은 SSOT 를 못 읽는 경로(컨테이너)에서도 돌아야 해서 버전 목록을 모른다.
     * 판정은 `/^\/v[^/]+\//` 하나뿐이다 — **첫 세그먼트가 `v` 로 시작하면 전부 불변**이다.
     * `/version/` 같은 이름도 그렇게 잡힌다. dist 최상위에 `v` 로 시작하는 디렉터리를
     * 새로 만들 일이 생기면 그 사실을 알고 있어야 한다.
     */
    expect((await request('/vzzz/style.css')).headers['cache-control']).toBe(
      'public, max-age=31536000, immutable',
    );
    expect((await request('/version/style.css')).headers['cache-control']).toBe(
      'public, max-age=31536000, immutable',
    );
    expect((await request('/static/style.css')).headers['cache-control']).toBe(
      'no-store',
    );
  });
});

describe('경로 탈출 방어', () => {
  it.each([
    ['상위 경로', '/../mfa-secret.txt'],
    ['여러 단계', '/../../mfa-secret.txt'],
    ['중간에 낀 ..', '/vt1abc/../../mfa-secret.txt'],
    ['퍼센트 인코딩', '/%2e%2e/mfa-secret.txt'],
    ['역슬래시', '/..\\mfa-secret.txt'],
  ])('%s 로는 dist 밖을 못 나간다', async (_label, url) => {
    const res = await request(url);
    // 200 이 나오면 그 순간 파일시스템이 열린 것이다.
    expect(res.statusCode).not.toBe(200);
    expect(`${res.body ?? ''}${res.text}`).not.toContain('비밀');
  });

  it('탈출을 막을 때는 403 이나 404 로 끝낸다', async () => {
    const res = await request('/../mfa-secret.txt');
    expect([403, 404]).toContain(res.statusCode);
  });

  it('정상 하위 경로는 막지 않는다', async () => {
    expect((await request('/vt1abc/mf-server.cjs')).statusCode).toBe(200);
  });
});
