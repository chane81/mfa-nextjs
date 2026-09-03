import { resolve } from 'node:path';

import { EXPOSE_SCAN, readExposes } from '@mfa/remote-config/node';
import { describe, expect, it } from 'vitest';

import serverExposes from './server-entry';

/**
 * **SSR 진입점 맵이 웹 `exposes` 와 같은가.**
 *
 * 웹 쪽 `exposes` 는 `src/exposes/` 스캔이라 파일을 놓는 것만으로 늘어난다. 그런데
 * SSR 번들의 맵은 **손으로 적는다** — 정적 import 여야 번들이 갈리지 않기 때문이다.
 * 그래서 이 한 자리만 자동화 밖에 있고, 빠뜨리면 브라우저에서는 되는데 서버 렌더에서만
 * "expose 없음" 이 되는 비대칭 상태가 된다.
 *
 * 그 상태는 host 가 그 모듈을 SSR 로 부르기 전까지 아무 데서도 안 잡힌다.
 * `pnpm build` 의 host 프리렌더가 결국 잡지만, 그건 remote 두 개를 다 빌드한 뒤다.
 * 여기서는 파일 하나 열어보는 값으로 잡는다.
 *
 * 이 테스트가 `.test.tsx` 인 이유: `server-entry.ts` 가 expose 컴포넌트를 import 하므로
 * 모듈 평가에 DOM 이 필요할 수 있다. 확장자로 환경을 가르는 게 이 저장소 규칙이다.
 */
const APP_ROOT = resolve(import.meta.dirname, '..');

describe('catalog SSR 진입점', () => {
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
