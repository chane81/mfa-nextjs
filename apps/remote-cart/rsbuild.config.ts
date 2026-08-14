import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { pluginModuleFederation } from "@module-federation/rsbuild-plugin";
import { defineConfig } from "@rsbuild/core";
import { pluginReact } from "@rsbuild/plugin-react";

const PORT = 3002;
const SSR_BUNDLE = resolve(process.cwd(), "dist/mf-server.cjs");
const PUBLIC_URL = `http://localhost:${PORT}`;

/**
 * cart remote — Rsbuild(Rspack) + @module-federation/rsbuild-plugin
 *
 * catalog(Vite)와 다른 번들러를 일부러 골랐다.
 * MF 는 "번들러가 달라도 런타임 계약만 맞으면 된다"는 걸 이 저장소에서 직접 검증하기 위함.
 */
export default defineConfig({
  plugins: [
    pluginReact(),
    pluginModuleFederation({
      name: "cart",
      filename: "remoteEntry.js",
      exposes: {
        "./CartPanel": "./src/exposes/CartPanel.tsx",
        "./CartBadge": "./src/exposes/CartBadge.tsx",
        "./CheckoutFlow": "./src/exposes/CheckoutFlow.tsx",
      },
      shared: {
        react: { singleton: true, requiredVersion: "^19.0.0" },
        "react-dom": { singleton: true, requiredVersion: "^19.0.0" },
      },
      /**
       * MF 자동 타입 생성(DTS)을 끈다. 이유는 catalog 쪽 vite.config.ts 주석 참고.
       * 요약: 타입 SSOT 가 `@mfa/contracts` 라 정보가 중복이고,
       * 타입 소비가 typecheck 에 remote 기동을 요구해 CI 비용이 크다.
       *
       * 콘솔의 `dynamic-remote-type-hints-plugin` 에러는 dts 가 아니라 dev 옵션 소관이다.
       */
      dts: false,
    }),
  ],
  server: {
    port: PORT,
    strictPort: true,
    // host(3000) 에서 remoteEntry 를 교차 출처로 로드
    cors: { origin: "*" },
  },
  dev: {
    // 청크가 3002 절대경로로 로드되도록 고정
    assetPrefix: PUBLIC_URL,
    /**
     * SSR 번들을 dev 서버에서도 내려준다.
     * 웹 번들은 메모리에서 서빙되지만 SSR 번들은 watch 빌드가 디스크에 쓰므로 직접 읽는다.
     * host 서버가 이 URL 을 fetch 해서 remote 를 서버 렌더링한다.
     */
    setupMiddlewares: [
      (middlewares) => {
        middlewares.unshift((req, res, next) => {
          if (req.url?.split("?")[0] !== "/mf-server.cjs") {
            next();
            return;
          }
          try {
            res.setHeader("Content-Type", "application/javascript; charset=utf-8");
            res.setHeader("Access-Control-Allow-Origin", "*");
            res.setHeader("Cache-Control", "no-store");
            res.end(readFileSync(SSR_BUNDLE, "utf8"));
          } catch {
            res.statusCode = 404;
            res.end("// SSR 번들 없음. watch 빌드가 도는지 확인하세요.");
          }
        });
      },
    ],
  },
  output: {
    assetPrefix: PUBLIC_URL,
  },
});
