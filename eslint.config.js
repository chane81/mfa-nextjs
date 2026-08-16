import { baseConfig } from '@mfa/eslint-config/base';
import { defineConfig, globalIgnores } from 'eslint/config';

/**
 * 루트 `scripts/` 전용. 워크스페이스 패키지들은 각자 `eslint.config.js` 를 갖는다.
 *
 * 여기서 그 디렉터리들을 무시하지 않으면 루트 `eslint .` 가 앱 소스까지 다시 훑으면서
 * 각 패키지의 설정(React 규칙 등) 없이 검사해 엉뚱한 에러를 낸다.
 */
export default defineConfig([
  globalIgnores(['apps/**', 'packages/**']),
  baseConfig,
]);
