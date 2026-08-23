import { MF_SSR_BUNDLE, SSR_EXTERNALS } from '@mfa/remote-config';
import { readBuildVersion, versionedDist } from '@mfa/remote-config/node';
import { defineConfig } from '@rsbuild/core';
import { pluginReact } from '@rsbuild/plugin-react';

/**
 * cart remote 의 SSR(node) 번들 빌드 설정.
 *
 * 산출물: dist/v<version>/mf-server.cjs
 * catalog(Vite)와 번들러는 다르지만 host 가 소비하는 계약은 동일하다.
 * - CommonJS(`commonjs2`) 라이브러리로 출력
 * - react 계열은 external → host 의 React 인스턴스를 주입받는다
 *
 * 버전은 웹 빌드와 **같은 값**이어야 한다 — 둘이 한 배포 단위다.
 * `.mf-version` 을 공유하고 판정도 같은 함수라 어긋날 수 없다.
 */
const VERSION = readBuildVersion();

/**
 * Rspack 의 `externals` 는 "이 id 를 어떤 형태로 가져올지"까지 받는다.
 * host 가 CJS 로 평가하며 `require` 셰임을 주입하므로 전부 `commonjs <id>` 다.
 * 목록 자체는 `SSR_EXTERNALS` 하나 — 형태만 여기서 붙인다.
 */
const externals = Object.fromEntries(
  SSR_EXTERNALS.map((id) => [id, `commonjs ${id}`]),
);

export default defineConfig({
  plugins: [pluginReact()],
  source: {
    // 엔트리 키가 곧 출력 파일의 `[name]` 이다 — 확장자는 아래 filename 에서 붙는다
    entry: { [MF_SSR_BUNDLE.name]: './src/server-entry.ts' },
  },
  output: {
    target: 'node',
    // 웹 번들과 같은 버전 디렉터리에 넣는다. 웹 빌드 다음에 돌기 때문에 정리는 하지 않는다.
    distPath: { root: versionedDist(VERSION), js: '' },
    filename: { js: `[name]${MF_SSR_BUNDLE.extension}` },
    cleanDistPath: false,
    minify: false,
    externals,
  },
  tools: {
    rspack: {
      output: {
        library: { type: 'commonjs2' },
      },
    },
  },
});
