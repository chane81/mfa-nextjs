import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { pluginModuleFederation } from "@module-federation/rsbuild-plugin";
import { defineConfig } from "@rsbuild/core";
import { pluginReact } from "@rsbuild/plugin-react";

const PORT = 3002;
const DIST = resolve(process.cwd(), "dist");
const PUBLIC_URL = `http://localhost:${PORT}`;

/** dev 서버가 디스크에서 직접 내려주는 경로 (빌드 산출물은 serve-remote-dist.mjs 가 서빙) */
const SERVED = /^\/(mf-server\.cjs|mf-version\.json)$/;

/**
 * 빌드 버전. `scripts/mf-build-version.mjs` 가 빌드 직전에 써 둔다.
 *
 * assetPrefix 와 출력 경로를 동시에 결정해 웹 자산까지 `/v<version>/` 불변 경로로 내보낸다.
 * dev(watch)에는 파일이 없을 수 있고, 그때는 버전 없는 경로로 떨어뜨린다.
 */
const VERSION = existsSync(resolve(process.cwd(), ".mf-version"))
  ? readFileSync(resolve(process.cwd(), ".mf-version"), "utf8").trim()
  : null;
const ASSET_PREFIX = VERSION ? `${PUBLIC_URL}/v${VERSION}` : PUBLIC_URL;
const DIST_ROOT = VERSION ? `dist/v${VERSION}` : "dist";

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
     * SSR 번들과 버전 매니페스트를 dev 서버에서 내려준다.
     * 웹 번들은 메모리에서 서빙되지만 이 파일들은 빌드가 디스크에 쓰므로 직접 읽는다.
     * (preview 는 dist 를 정적으로 서빙하므로 이 미들웨어가 필요 없다)
     *
     *   /mf-server.cjs          — 버전 없는 최신본
     *   /v<hash>/mf-server.cjs  — 불변 아티팩트
     *   /mf-version.json        — 현재 버전 공표
     */
    setupMiddlewares: [
      (middlewares) => {
        middlewares.unshift((req, res, next) => {
          const path = req.url?.split("?")[0] ?? "";
          if (!SERVED.test(path)) {
            next();
            return;
          }
          try {
            const body = readFileSync(resolve(DIST, `.${path}`), "utf8");
            res.setHeader(
              "Content-Type",
              path.endsWith(".json")
                ? "application/json; charset=utf-8"
                : "application/javascript; charset=utf-8",
            );
            res.setHeader("Access-Control-Allow-Origin", "*");
            res.setHeader("Cache-Control", "no-store");
            res.end(body);
          } catch {
            res.statusCode = 404;
            res.end("// 없음. `pnpm build` (stamp 포함) 또는 watch 빌드를 확인하세요.");
          }
        });
      },
    ],
  },
  output: {
    assetPrefix: ASSET_PREFIX,
    // 웹 자산 전체를 버전 디렉터리로 내보낸다 → 배포된 URL 은 다시 바뀌지 않는다
    distPath: { root: DIST_ROOT },
  },
});
