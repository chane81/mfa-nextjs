import { resolve } from 'node:path';

import { EXPOSE_SCAN, readExposes } from '@mfa/remote-config/node';
import { describe, expect, it } from 'vitest';

import serverExposes from './server-entry';

/**
 * **SSR 진입점 맵이 웹 `exposes` 와 같은가.**
 *
 * 근거는 catalog 의 같은 파일에 적었다 — 웹 쪽은 디렉터리 스캔인데 SSR 맵만 손으로
 * 적으므로, 빠뜨리면 브라우저에서는 되고 서버 렌더에서만 "expose 없음" 이 된다.
 *
 * 번들러가 갈려도(Vite / Rsbuild) 이 성질은 같아야 해서 두 remote 에 같은 검사를 둔다.
 */
const APP_ROOT = resolve(import.meta.dirname, '..');

describe('cart SSR 진입점', () => {
  it('맵의 키가 웹 `exposes` 스캔 결과와 정확히 같다', () => {
    const scanned = readExposes(EXPOSE_SCAN.dir, {
      ignore: EXPOSE_SCAN.ignore,
      cwd: APP_ROOT,
    });

    expect(Object.keys(serverExposes).sort()).toEqual(
      Object.keys(scanned.exposes).sort(),
    );
  });
});
