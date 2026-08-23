import { MF_FILES, SSR_EXTERNALS } from '@mfa/remote-config';
import { readBuildVersion, versionedDist } from '@mfa/remote-config/node';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/**
 * catalog remote 의 SSR(node) 번들 빌드 설정.
 *
 * 산출물: dist/v<version>/mf-server.cjs
 * - CommonJS: host 서버가 `new Function("module","exports","require", code)` 로 평가한다.
 *   (ESM 을 문자열에서 평가하려면 vm.SourceTextModule 플래그가 필요해 실용적이지 않다)
 * - react 계열은 external: host 의 React 인스턴스를 require 셰임으로 주입받는다.
 *   여기서 React 를 번들에 넣으면 서버에서도 React 가 2벌이 된다.
 *   목록은 `SSR_EXTERNALS` 하나다 — host 의 주입 목록과 어긋나면
 *   `예상 밖 모듈을 require 했습니다` 로 터진다.
 *
 * 버전은 웹 빌드와 **같은 값**이어야 한다 — 둘이 한 배포 단위라 같은 디렉터리에
 * 모여야 stamp 가 양쪽을 찾는다. `.mf-version` 을 공유하므로 자연히 맞는다.
 */
const VERSION = readBuildVersion();

export default defineConfig({
  plugins: [react()],
  build: {
    ssr: './src/server-entry.ts',
    // 웹 번들과 같은 버전 디렉터리에 넣는다. 한 배포 단위가 한 경로에 모인다.
    // 웹 빌드가 먼저 돌고 나서 실행되므로 emptyOutDir 은 꺼야 한다.
    outDir: versionedDist(VERSION),
    emptyOutDir: false,
    minify: false,
    target: 'node20',
    rollupOptions: {
      external: [...SSR_EXTERNALS],
      output: {
        format: 'cjs',
        entryFileNames: MF_FILES.ssrBundle,
        exports: 'named',
      },
    },
  },
});
