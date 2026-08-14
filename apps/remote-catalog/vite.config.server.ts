import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

/**
 * catalog remote 의 SSR(node) 번들 빌드 설정.
 *
 * 산출물: dist-server/mf-server.cjs
 * - CommonJS: host 서버가 `new Function("module","exports","require", code)` 로 평가한다.
 *   (ESM 을 문자열에서 평가하려면 vm.SourceTextModule 플래그가 필요해 실용적이지 않다)
 * - react 계열은 external: host 의 React 인스턴스를 require 셰임으로 주입받는다.
 *   여기서 React 를 번들에 넣으면 서버에서도 React 가 2벌이 된다.
 */
export default defineConfig({
  plugins: [react()],
  build: {
    ssr: "./src/server-entry.ts",
    // 웹 번들과 같은 dist 에 넣어 preview / 정적 배포에서 그대로 서빙되게 한다.
    // 웹 빌드가 먼저 돌고 나서 실행되므로 emptyOutDir 은 꺼야 한다.
    outDir: "dist",
    emptyOutDir: false,
    minify: false,
    target: "node20",
    rollupOptions: {
      external: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime"],
      output: {
        format: "cjs",
        entryFileNames: "mf-server.cjs",
        exports: "named",
      },
    },
  },
});
