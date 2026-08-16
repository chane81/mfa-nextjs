import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { MF_SSR_BUNDLE } from '@mfa/remote-config';
import { defineConfig } from '@rsbuild/core';
import { pluginReact } from '@rsbuild/plugin-react';

/**
 * 빌드 버전. 웹 빌드와 **같은 값**이어야 한다 — 둘이 한 배포 단위다.
 * `.mf-version` 을 공유하므로 자연히 맞는다. watch(dev)에는 없을 수 있다.
 *
 * 파일이 있어도 **내용이 비어 있으면 없는 것으로 본다.** 존재 여부만 보면
 * `dist/v` 라는 버전 없는 버전 경로가 만들어져, 웹 빌드(빈 값을 falsy 로 거르는)와
 * 출력 경로가 어긋난다.
 */
const VERSION_FILE = resolve(process.cwd(), '.mf-version');
const VERSION = existsSync(VERSION_FILE)
  ? readFileSync(VERSION_FILE, 'utf8').trim()
  : '';
const DIST_ROOT = VERSION ? `dist/v${VERSION}` : 'dist';

/**
 * cart remote 의 SSR(node) 번들 빌드 설정.
 *
 * 산출물: dist/v<version>/mf-server.cjs
 * catalog(Vite)와 번들러는 다르지만 host 가 소비하는 계약은 동일하다.
 * - CommonJS(`commonjs2`) 라이브러리로 출력
 * - react 계열은 external → host 의 React 인스턴스를 주입받는다
 */
export default defineConfig({
  plugins: [pluginReact()],
  source: {
    // 엔트리 키가 곧 출력 파일의 `[name]` 이다 — 확장자는 아래 filename 에서 붙는다
    entry: { [MF_SSR_BUNDLE.name]: './src/server-entry.ts' },
  },
  output: {
    target: 'node',
    // 웹 번들과 같은 버전 디렉터리에 넣는다. 웹 빌드 다음에 돌기 때문에 정리는 하지 않는다.
    distPath: { root: DIST_ROOT, js: '' },
    filename: { js: `[name]${MF_SSR_BUNDLE.extension}` },
    cleanDistPath: false,
    minify: false,
    externals: {
      react: 'commonjs react',
      'react-dom': 'commonjs react-dom',
      'react/jsx-runtime': 'commonjs react/jsx-runtime',
      'react/jsx-dev-runtime': 'commonjs react/jsx-dev-runtime',
    },
  },
  tools: {
    rspack: {
      output: {
        library: { type: 'commonjs2' },
      },
    },
  },
});
