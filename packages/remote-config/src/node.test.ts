import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { fakeResponse } from '@tests/helpers/http';

import { MF_FILES } from '@mfa/remote-config';

import {
  assetBase,
  createMfDevMiddleware,
  readBuildVersion,
  readExposes,
  versionedDist,
} from './node';

/** 각 테스트가 쓸 임시 디렉터리 하나 */
let dir: string;
beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'mfa-remote-config-'));
});
afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

const write = (name: string, content: string) => {
  writeFileSync(join(dir, name), content, 'utf8');
};

describe('readBuildVersion', () => {
  it('파일이 없으면 null 이다 — dev 에는 없는 게 정상이다', () => {
    expect(readBuildVersion(join(dir, '없는-디렉터리'))).toBeNull();
  });

  it('내용을 trim 해서 준다', () => {
    write('.mf-version', 't1abc\n');
    expect(readBuildVersion(dir)).toBe('t1abc');
  });

  it('공백만 있으면 없는 것으로 본다', () => {
    // 존재 여부만 보면 `dist/v` 라는 버전 없는 버전 경로가 만들어진다.
    // 실제로 웹 빌드와 SSR 빌드가 그 갈래로 다른 디렉터리에 나간 적이 있다.
    write('.mf-version', '   \n\t ');
    expect(readBuildVersion(dir)).toBeNull();
  });

  it('빈 파일도 없는 것으로 본다', () => {
    write('.mf-version', '');
    expect(readBuildVersion(dir)).toBeNull();
  });

  it('기본값은 process.cwd() 다', () => {
    const spy = vi.spyOn(process, 'cwd').mockReturnValue(dir);
    write('.mf-version', 't9zzz');
    expect(readBuildVersion()).toBe('t9zzz');
    spy.mockRestore();
  });
});

describe('readExposes', () => {
  /**
   * remote 의 **공개 계약이 이 함수 하나로 정해진다.** 파일을 놓는 것만으로 노출이
   * 늘어나므로, 무엇을 세고 무엇을 거르는지가 곧 계약이다.
   *
   * 전에는 이 성질을 각 remote 의 `src/exposes/contract.test.ts` 가 확인했다. 그런데
   * 그 테스트는 `@mfa/contracts` 의 모듈 계약을 import 해야 했고, 그 계약이 MF DTS
   * (= remote 빌드 산출물)를 읽게 되면서 **remote 가 자기 산출물에 묶이는 순환**이
   * 생겼다. 스캔 규칙은 애초에 이 함수의 성질이지 특정 remote 의 성질이 아니라
   * 여기가 제자리다. "스캔 결과 ≡ 등록된 모듈" 대조는 `@mfa/contracts` 가 컴파일
   * 타임에 한다(`ModuleIdsAreExhaustive`).
   */
  let exposeDir: string;

  beforeAll(() => {
    exposeDir = join(dir, 'scan');
    mkdirSync(join(exposeDir, 'src', 'exposes'), { recursive: true });
    const put = (name: string) =>
      writeFileSync(join(exposeDir, 'src', 'exposes', name), '', 'utf8');
    put('ProductGrid.tsx');
    put('ProductDetail.tsx');
    put('exposes.test.tsx');
    put('README.md');
    put('helper.ts');
  });

  const scan = () =>
    readExposes('./src/exposes', {
      ignore: [/\.test\.tsx$/],
      cwd: exposeDir,
    });

  it('`.tsx` 만 센다 — 이웃한 `.ts` · 문서는 계약이 아니다', () => {
    expect(Object.keys(scan().exposes).sort()).toEqual([
      './ProductDetail',
      './ProductGrid',
    ]);
  });

  it('ignore 에 걸린 이웃 파일은 노출되지 않는다', () => {
    // 이 저장소는 테스트를 대상 소스 옆에 둔다. 거르지 않으면 remote 의 공개 계약이
    // 조용히 늘고, dev 에서는 사전 transform 까지 시도하다 터진다(known-issues H-2).
    expect(scan().files.some((f) => f.includes('.test.'))).toBe(false);
  });

  it('expose 키는 전부 `./` 로 시작한다 — MF 가 요구하는 형식이다', () => {
    for (const key of Object.keys(scan().exposes)) {
      expect(key.startsWith('./')).toBe(true);
    }
  });

  it('`files` 는 스캔 인자로 준 디렉터리 기준 경로다 — 워밍이 그대로 쓴다', () => {
    expect(scan().files.sort()).toEqual([
      './src/exposes/ProductDetail.tsx',
      './src/exposes/ProductGrid.tsx',
    ]);
  });

  it('ignore 를 안 주면 아무것도 거르지 않는다 — 호출부가 명시해야 한다', () => {
    const all = readExposes('./src/exposes', { cwd: exposeDir });
    expect(Object.keys(all.exposes)).toContain('./exposes.test');
  });
});

describe('versionedDist', () => {
  it('버전이 있으면 그 아래로 보낸다', () => {
    expect(versionedDist('t1abc')).toBe('dist/vt1abc');
  });

  it.each([undefined, null, ''])('버전이 %s 면 dist 다', (version) => {
    expect(versionedDist(version)).toBe('dist');
  });

  it('앱 기준 상대 경로다 — 번들러가 그렇게 받는다', () => {
    expect(versionedDist('t1abc').startsWith('dist')).toBe(true);
  });
});

describe('assetBase', () => {
  const URL_ = 'https://catalog.example.com';

  it('버전이 있으면 버전 경로를 붙인다', () => {
    expect(assetBase(URL_, 't1abc')).toBe(`${URL_}/vt1abc`);
  });

  it('버전이 없으면 오리진 그대로다', () => {
    expect(assetBase(URL_, null)).toBe(URL_);
  });

  it('trailingSlash 를 켜면 뒤에 슬래시를 붙인다', () => {
    // Vite `base` 는 슬래시가 없으면 마지막 세그먼트를 디렉터리가 아니라 파일로 붙인다.
    expect(assetBase(URL_, 't1abc', { trailingSlash: true })).toBe(
      `${URL_}/vt1abc/`,
    );
    expect(assetBase(URL_, null, { trailingSlash: true })).toBe(`${URL_}/`);
  });

  it('기본값은 슬래시 없음 — Rsbuild assetPrefix 가 그걸 기대한다', () => {
    expect(assetBase(URL_, 't1abc').endsWith('/')).toBe(false);
  });
});

describe('createMfDevMiddleware', () => {
  const call = (
    middleware: ReturnType<typeof createMfDevMiddleware>,
    url: string | undefined,
  ) => {
    const res = fakeResponse();
    const next = vi.fn();
    middleware({ url }, res, next);
    return { res, next };
  };

  const dev = () => createMfDevMiddleware({ dist: dir, kind: 'dev' });
  const preview = () => createMfDevMiddleware({ dist: dir, kind: 'preview' });

  beforeAll(() => {
    write(MF_FILES.ssrBundle, 'module.exports = {};');
    write(MF_FILES.versionManifest, '{"version":"t1abc"}');
  });

  it('SSR 번들을 디스크에서 읽어 내려준다', () => {
    // 웹 번들은 번들러가 메모리에서 서빙하지만 SSR 번들은 watch 빌드가 디스크에 쓴다.
    const { res, next } = call(dev(), `/${MF_FILES.ssrBundle}`);

    expect(res.statusCode).toBe(200);
    expect(res.body).toBe('module.exports = {};');
    expect(next).not.toHaveBeenCalled();
  });

  it('쿼리스트링을 떼고 판단한다', () => {
    const { res } = call(dev(), `/${MF_FILES.ssrBundle}?v=1`);
    expect(res.body).toBe('module.exports = {};');
  });

  it('교차 출처와 캐시 헤더를 붙인다', () => {
    // host(3000) 페이지가 교차 출처로 이 파일을 받아간다.
    const { res } = call(dev(), `/${MF_FILES.ssrBundle}`);

    expect(res.headers['access-control-allow-origin']).toBe('*');
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.headers['content-type']).toBe(
      'application/javascript; charset=utf-8',
    );
  });

  it('.json 은 JSON MIME 으로 준다', () => {
    const { res } = call(preview(), `/${MF_FILES.versionManifest}`);
    expect(res.headers['content-type']).toBe('application/json; charset=utf-8');
  });

  it('dev 는 버전 매니페스트를 404 로 감춘다', () => {
    // 직전 build 가 남긴 파일을 dev 가 내려주면 **하지도 않은 배포를 공표**하게 된다.
    // host 가 /v<ver>/mf-server.cjs 를 요청하고, dev 는 그 경로를 모르니 SPA 폴백(200)을
    // 주고, 그 바이트가 공표된 해시와 달라 무결성 검사에서 죽는다.
    const { res, next } = call(dev(), `/${MF_FILES.versionManifest}`);

    expect(res.statusCode).toBe(404);
    expect(next).not.toHaveBeenCalled();
    expect(JSON.parse(res.body!)).toMatchObject({
      error: expect.stringContaining('dev 에는 버전 공표가 없습니다'),
    });
  });

  it('preview 는 버전 매니페스트를 내려준다', () => {
    const { res } = call(preview(), `/${MF_FILES.versionManifest}`);
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body!)).toEqual({ version: 't1abc' });
  });

  it('서빙 대상이 아니면 next() 로 넘긴다', () => {
    const { res, next } = call(dev(), '/index.html');
    expect(next).toHaveBeenCalledOnce();
    expect(res.ended).toBe(false);
  });

  it.each([
    ['상위 경로 탈출', '/../../etc/passwd'],
    ['하위 경로', '/nested/mf-server.cjs'],
    ['빈 URL', undefined],
    ['루트', '/'],
  ])('%s 은 허용 목록에 없으므로 next() 다', (_label, url) => {
    // 허용 목록을 **먼저** 보기 때문에 경로 탈출이 파일 읽기까지 가지 않는다.
    const { next } = call(dev(), url);
    expect(next).toHaveBeenCalledOnce();
  });

  it('허용 목록에 있어도 파일이 없으면 404 다', () => {
    const empty = createMfDevMiddleware({
      dist: join(dir, '빈-디렉터리'),
      kind: 'dev',
    });
    const { res, next } = call(empty, `/${MF_FILES.ssrBundle}`);

    expect(res.statusCode).toBe(404);
    expect(res.body).toContain('pnpm build');
    expect(next).not.toHaveBeenCalled();
  });

  it('dev 와 preview 의 서빙 목록이 다르다', () => {
    // 갈라지면 remote 별로 증상이 다르게 나타난다.
    expect(call(dev(), `/${MF_FILES.versionManifest}`).res.statusCode).toBe(
      404,
    );
    expect(call(preview(), `/${MF_FILES.versionManifest}`).res.statusCode).toBe(
      200,
    );
  });
});
