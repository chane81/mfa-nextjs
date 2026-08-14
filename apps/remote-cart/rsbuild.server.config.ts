import { defineConfig } from "@rsbuild/core";
import { pluginReact } from "@rsbuild/plugin-react";

/**
 * cart remote 의 SSR(node) 번들 빌드 설정.
 *
 * 산출물: dist-server/mf-server.cjs
 * catalog(Vite)와 번들러는 다르지만 host 가 소비하는 계약은 동일하다.
 * - CommonJS(`commonjs2`) 라이브러리로 출력
 * - react 계열은 external → host 의 React 인스턴스를 주입받는다
 */
export default defineConfig({
  plugins: [pluginReact()],
  source: {
    entry: { "mf-server": "./src/server-entry.ts" },
  },
  output: {
    target: "node",
    // 웹 번들과 같은 dist 에 넣는다. 웹 빌드 다음에 돌기 때문에 정리는 하지 않는다.
    distPath: { root: "dist", js: "" },
    filename: { js: "[name].cjs" },
    cleanDistPath: false,
    minify: false,
    externals: {
      react: "commonjs react",
      "react-dom": "commonjs react-dom",
      "react/jsx-runtime": "commonjs react/jsx-runtime",
      "react/jsx-dev-runtime": "commonjs react/jsx-dev-runtime",
    },
  },
  tools: {
    rspack: {
      output: {
        library: { type: "commonjs2" },
      },
    },
  },
});
