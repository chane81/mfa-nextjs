import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/**
 * 빌드 버전. 웹 빌드와 **같은 값**이어야 한다 — 둘이 한 배포 단위이기 때문이다.
 * `.mf-version` 을 공유하므로 자연히 맞는다.
 *
 * watch 모드(dev)에는 파일이 없을 수 있고, 그때는 버전 없는 경로로 떨어뜨린다.
 */
function versionDir(): string {
  const file = resolve(process.cwd(), '.mf-version');
  if (!existsSync(file)) return 'dist';

  /**
   * 파일이 있어도 **내용이 비어 있으면 없는 것으로 본다.**
   * 안 그러면 `dist/v` 라는 버전 없는 버전 경로가 만들어져,
   * 빈 값을 falsy 로 거르는 웹 빌드와 출력 경로가 어긋난다.
   */
  const version = readFileSync(file, 'utf8').trim();
  return version ? `dist/v${version}` : 'dist';
}

/**
 * catalog remote 의 SSR(node) 번들 빌드 설정.
 *
 * 산출물: dist/v<version>/mf-server.cjs
 * - CommonJS: host 서버가 `new Function("module","exports","require", code)` 로 평가한다.
 *   (ESM 을 문자열에서 평가하려면 vm.SourceTextModule 플래그가 필요해 실용적이지 않다)
 * - react 계열은 external: host 의 React 인스턴스를 require 셰임으로 주입받는다.
 *   여기서 React 를 번들에 넣으면 서버에서도 React 가 2벌이 된다.
 */
export default defineConfig({
  plugins: [react()],
  build: {
    ssr: './src/server-entry.ts',
    // 웹 번들과 같은 버전 디렉터리에 넣는다. 한 배포 단위가 한 경로에 모인다.
    // 웹 빌드가 먼저 돌고 나서 실행되므로 emptyOutDir 은 꺼야 한다.
    outDir: versionDir(),
    emptyOutDir: false,
    minify: false,
    target: 'node20',
    rollupOptions: {
      external: [
        'react',
        'react-dom',
        'react/jsx-runtime',
        'react/jsx-dev-runtime',
      ],
      output: {
        format: 'cjs',
        entryFileNames: 'mf-server.cjs',
        exports: 'named',
      },
    },
  },
});
