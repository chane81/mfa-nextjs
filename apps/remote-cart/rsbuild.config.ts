import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { pluginModuleFederation } from "@module-federation/rsbuild-plugin";
import { defineConfig } from "@rsbuild/core";
import { pluginReact } from "@rsbuild/plugin-react";

const PORT = 3002;
const DIST = resolve(process.cwd(), "dist");
/**
 * 이 remote 가 배포된 **공개 오리진**. assetPrefix 가 여기서 나온다.
 *
 * host 는 자기 도메인에서 이 remote 의 청크를 받아간다. 상대 경로면 브라우저가
 * host 도메인에서 청크를 찾으므로 절대 URL 이어야 한다.
 *
 * 빌드 시점에 굳는 값이라 배포 파이프라인에서 빌드 인자로 넘긴다.
 * (docs/03-setup/04-dokploy.md)
 */
const PUBLIC_URL = (
  process.env.REMOTE_CART_PUBLIC_URL || `http://localhost:${PORT}`
).replace(/\/+$/, "");

/**
 * dev 서버가 디스크에서 직접 내려주는 경로 (빌드 산출물은 serve-remote-dist.mjs 가 서빙).
 *
 * **`mf-version.json` 은 일부러 뺐다.** 근거는 catalog 쪽 vite.config.ts 주석 참고 —
 * 요약하면 직전 빌드가 남긴 매니페스트를 dev 에서 공표하면 host 가 버전 경로를 요청하고,
 * dev 서버가 모르는 경로라 폴백 응답을 주면서 무결성 검사에서 죽는다.
 */
const SERVED = /^\/mf-server\.cjs$/;

/** preview 는 빌드 산출물을 서빙하는 자리라 버전 공표도 의미가 있다 */
const SERVED_IN_PREVIEW = /^\/(mf-server\.cjs|mf-version\.json)$/;

/**
 * dev 에 존재하지 않는 배포 개념. 그냥 next() 로 흘리면 무엇이 이 요청을 처리했는지가
 * 응답에 따라 달라져 원인 추적이 어렵다. 여기서 명시적으로 404 를 준다.
 */
const NOT_IN_DEV = /^\/mf-version\.json$/;

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
    /**
     * SSR 번들을 서버에서 직접 내려준다.
     * 웹 번들은 메모리에서 서빙되지만 이 파일은 watch 빌드가 디스크에 쓰므로 직접 읽는다.
     *
     *   /mf-server.cjs — watch 빌드가 쓰는 버전 없는 최신본
     *
     * 버전 경로(`/v<hash>/…`)는 어느 쪽에도 없다. 배포 산출물의 개념이라
     * `serve-remote-dist.mjs` 가 담당한다.
     *
     * `action` 으로 dev 와 preview 를 가른다. 이 훅은 **양쪽 모두에서** 호출되는데,
     * 버전 공표(`mf-version.json`)는 dev 에 없고 preview(빌드 산출물)에는 있다.
     * 구분하지 않으면 preview 가 자기 매니페스트를 404 로 감춘다.
     *
     * 옛 `dev.setupMiddlewares` 는 Rsbuild 2 에서 deprecated 다 (기동 시 경고 출력).
     */
    setup: ({ server, action }) => {
      const dev = action === "dev";

      server.middlewares.use((req, res, next) => {
        const path = req.url?.split("?")[0] ?? "";

        if (dev && NOT_IN_DEV.test(path)) {
          res.statusCode = 404;
          res.setHeader("Content-Type", "application/json; charset=utf-8");
          res.setHeader("Access-Control-Allow-Origin", "*");
          res.end(
            '{"error":"dev 에는 버전 공표가 없습니다. host 는 버전 없는 엔트리로 폴백합니다."}',
          );
          return;
        }

        if (!(dev ? SERVED : SERVED_IN_PREVIEW).test(path)) {
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
          res.end(
            "// 없음. `pnpm build` (stamp 포함) 또는 watch 빌드를 확인하세요.",
          );
        }
      });
    },
  },
  dev: {
    // 청크가 3002 절대경로로 로드되도록 고정
    assetPrefix: PUBLIC_URL,
  },
  output: {
    assetPrefix: ASSET_PREFIX,
    // 웹 자산 전체를 버전 디렉터리로 내보낸다 → 배포된 URL 은 다시 바뀌지 않는다
    distPath: { root: DIST_ROOT },
  },
});
