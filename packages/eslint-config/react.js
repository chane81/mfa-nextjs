import { defineConfig } from 'eslint/config';
import globals from 'globals';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';

import { baseConfig } from './base.js';

/** Vite / Rsbuild 기반 순수 React remote 용 설정 */
export const reactConfig = defineConfig([
  ...baseConfig,
  {
    files: ['**/*.{ts,tsx,js,jsx}'],
    languageOptions: {
      globals: { ...globals.browser, ...globals.es2023 },
    },
    plugins: { react, 'react-hooks': reactHooks },
    // "detect" 로 두면 eslint-plugin-react 7.37 의 버전 탐지 코드가
    // ESLint 10 API 와 충돌해 `contextOrFilename.getFilename is not a function` 로 죽는다.
    // 버전을 고정하면 탐지 경로 자체를 타지 않는다.
    settings: { react: { version: '19.2' } },
    rules: {
      ...react.configs.flat.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      // React 19 + 자동 JSX 런타임에서는 불필요
      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off',
    },
  },
]);

export default reactConfig;
