import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

/**
 * 테스트 러너 설정. 테스트 코드는 전부 루트 `tests/` 에 있다 — 배경과 진척도는
 * `docs/06-testing/01-test-plan.md`.
 *
 * ## 왜 alias 로 `src` 를 직접 가리키나
 *
 * 워크스페이스 패키지들의 `exports` 는 `./dist/*.js` 를 가리킨다. 그대로 두면 테스트를
 * 돌리기 전에 매번 `pnpm build` 를 해야 하고, 커버리지도 `dist` 기준으로 잡혀 원본과
 * 어긋난다. alias 를 여기 한 곳에만 두면 **빌드 없이 소스를 직접 테스트**할 수 있고
 * turbo 에 `^build` 의존을 걸 필요도 없어진다.
 *
 * `@mfa/store` 는 `exports` 에 `react-server` 조건 분기까지 있어서 러너가 어느 쪽을
 * 고를지 애매하다. alias 로 못 박으면 그 애매함도 같이 사라진다.
 */
const at = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  // TSX 변환. remote-catalog 와 같은 버전을 쓴다.
  plugins: [react()],

  resolve: {
    /**
     * ⚠️ 배열 형태에 정규식으로 적는다. 객체 형태(문자열 키)는 **접두사 매치**라
     * `@mfa/store` 항목이 `@mfa/store/server` 까지 삼킨다. 그러면 부수효과 0 인
     * 서버 진입점을 부르려던 테스트가 배럴을 타면서 top-level 싱글턴을 깨운다.
     */
    alias: [
      {
        find: /^@mfa\/store\/server$/,
        replacement: at('./packages/store/src/server.ts'),
      },
      {
        find: /^@mfa\/store$/,
        replacement: at('./packages/store/src/index.ts'),
      },
      {
        find: /^@mfa\/contracts$/,
        replacement: at('./packages/contracts/src/index.ts'),
      },
      { find: /^@mfa\/ui$/, replacement: at('./packages/ui/src/index.ts') },
      {
        find: /^@mfa\/remote-config\/node$/,
        replacement: at('./packages/remote-config/src/node.ts'),
      },
      {
        find: /^@mfa\/remote-config$/,
        replacement: at('./packages/remote-config/src/index.ts'),
      },
      // host 의 tsconfig `paths` 와 같은 규칙
      { find: /^@\//, replacement: `${at('./apps/host/src')}/` },
      // 테스트가 공유하는 셋업·헬퍼. 테스트 파일은 소스 옆에 있으므로 상대 경로로는
      // `../../../../tests/...` 가 된다 — 깊이가 파일마다 달라져서 옮길 때마다 깨진다.
      { find: /^@tests\//, replacement: `${at('./tests')}/` },
    ],
    /**
     * 루트(테스트·RTL)와 각 패키지가 각자 `react` 를 해석한다. pnpm 이 같은 버전을
     * 같은 실체로 링크하지만, 훅이 두 인스턴스로 갈리면 `Invalid hook call` 로만
     * 나타나고 원인이 어디에도 안 적힌다. 명시해두면 그 경우가 성립하지 않는다.
     */
    dedupe: ['react', 'react-dom'],
  },

  test: {
    // 저장소 스타일대로 명시적 import 를 쓴다(`globals` 기본값 false 유지).
    // 그래서 RTL 자동 cleanup 이 안 걸린다 — `tests/setup/dom.ts` 가 직접 등록한다.
    restoreMocks: true,
    unstubEnvs: true,
    unstubGlobals: true,

    /**
     * 테스트 파일은 **대상 소스 옆에** 둔다(`cookie-codec.ts` → `cookie-codec.test.ts`).
     * 그래서 환경은 디렉터리가 아니라 **확장자**로 가른다.
     *
     *   `*.test.ts`   node   — 순수 로직, fetch/fs 모킹, Route Handler
     *   `*.test.tsx`  jsdom  — DOM 이 필요한 것 전부(컴포넌트 · 훅 · document.cookie)
     *
     * 대상이 `.ts` 여도 DOM 이 필요하면 테스트는 `.test.tsx` 다(`renderHook` 은 JSX 가
     * 없어도 된다). 규칙이 하나뿐이라 파일을 열지 않고도 어느 환경에서 도는지 안다.
     *
     * Vitest 4 에서 별도 `vitest.workspace.ts` 는 없어졌고 이 `projects` 배열이 그 자리를
     * 대신한다(근거: vitest v4.1.6 `docs/guide/projects.md`). `extends: true` 가 위의
     * plugins · resolve 를 물려받게 한다 — 빼면 alias 가 안 먹는다.
     */
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          environment: 'node',
          include: ['{apps,packages,scripts}/**/*.test.ts'],
          exclude: ['**/node_modules/**', '**/dist/**', '**/.next/**'],
        },
      },
      {
        extends: true,
        test: {
          name: 'dom',
          environment: 'jsdom',
          include: ['{apps,packages}/**/*.test.tsx'],
          exclude: ['**/node_modules/**', '**/dist/**', '**/.next/**'],
          setupFiles: ['./tests/setup/dom.ts'],
        },
      },
    ],

    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['apps/*/src/**', 'packages/*/src/**', 'scripts/**'],
      exclude: ['**/*.test.ts', '**/*.test.tsx'],
    },
  },
});
