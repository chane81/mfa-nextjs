import { baseConfig } from '@mfa/eslint-config/base';
import { reactConfig } from '@mfa/eslint-config/react';
import { defineConfig, globalIgnores } from 'eslint/config';

/**
 * 루트 `scripts/` 와 `tests/` 전용. 워크스페이스 패키지들은 각자 `eslint.config.js` 를 갖는다.
 *
 * 여기서 그 디렉터리들을 무시하지 않으면 루트 `eslint .` 가 앱 소스까지 다시 훑으면서
 * 각 패키지의 설정(React 규칙 등) 없이 검사해 엉뚱한 에러를 낸다.
 */
export default defineConfig([
  globalIgnores(['apps/**', 'packages/**', 'coverage/**']),
  baseConfig,
  {
    /**
     * 루트 `tests/` 는 `dom` 프로젝트의 셋업(`setup/dom.ts`)과 렌더 헬퍼를 담는다.
     * React 규칙과 브라우저 globals 가 없으면 여기 `.tsx` 헬퍼가 생기는 순간
     * JSX 가 `no-undef` 로 걸리고 훅 규칙도 안 돈다.
     *
     * 정작 컴포넌트를 렌더하는 `*.test.tsx` 는 **소스 옆에** 있어 각 패키지의
     * eslint.config.js 가 본다. 여기 규칙은 그 대칭을 맞춰두는 것이다.
     */
    files: ['tests/**/*.{ts,tsx}'],
    extends: [reactConfig],
  },
]);
