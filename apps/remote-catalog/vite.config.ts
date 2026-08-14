import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { federation } from "@module-federation/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Connect, type Plugin } from "vite";

const PORT = 3001;

/**
 * SSR 번들(dist/mf-server.cjs)을 dev / preview 서버에서도 그대로 내려준다.
 * 웹 번들은 dev 에서 메모리로 서빙되지만 SSR 번들은 watch 빌드가 디스크에 쓰므로 직접 읽는다.
 * host 서버가 이 URL 을 fetch 해서 remote 를 서버 렌더링한다.
 */
function serveSsrBundle(): Plugin {
  const file = resolve(process.cwd(), "dist/mf-server.cjs");

  const middleware: Connect.NextHandleFunction = (req, res, next) => {
    if (req.url?.split("?")[0] !== "/mf-server.cjs") return next();
    try {
      res.setHeader("Content-Type", "application/javascript; charset=utf-8");
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Cache-Control", "no-store");
      res.end(readFileSync(file, "utf8"));
    } catch {
      res.statusCode = 404;
      res.end("// SSR 번들이 아직 없습니다. `pnpm build:ssr` 또는 dev 의 watch 빌드를 확인하세요.");
    }
  };

  return {
    name: "mfa-serve-ssr-bundle",
    configureServer: (server) => {
      server.middlewares.use(middleware);
    },
    configurePreviewServer: (server) => {
      server.middlewares.use(middleware);
    },
  };
}

/**
 * catalog remote — Vite 8 + @module-federation/vite
 *
 * nextjs-mf(webpack) 를 쓰지 않는 이유는 docs/01-research 참고.
 * remote 쪽은 번들러가 자유롭기 때문에 Vite 로 빌드하고,
 * host(Next.js 16 / Turbopack) 는 런타임 API 로만 이 remote 를 소비한다.
 */
export default defineConfig({
  plugins: [
    react(),
    serveSsrBundle(),
    federation({
      name: "catalog",
      filename: "remoteEntry.js",
      // mf-manifest.json 을 내보내야 host 런타임이 포맷/공유 정보를 자동 판별한다
      manifest: true,
      /**
       * MF 자동 타입 생성(DTS)을 끈다.
       *
       * 이유는 **콘솔 에러가 아니라** 아래 두 가지다.
       * 1. 타입 계약의 SSOT 는 `@mfa/contracts` 의 RemoteModuleMap 이다. 정보가 중복이다.
       * 2. host 가 타입을 소비하려면 typecheck 전에 remote 가 HTTP 로 떠 있어야 한다.
       *    지금은 `pnpm typecheck` 가 네트워크 없이 돈다. 그 성질을 잃고 싶지 않다.
       *
       * `[ dynamic-remote-type-hints-plugin ] err: [object Event]` 는 dts 가 아니라
       * **dev 옵션** 소관이다. DTS 를 켜고 싶다면 이렇게 하면 된다(실측 확인).
       *
       *   dts: true,
       *   dev: { disableDynamicRemoteTypeHints: true },
       *
       * 검토 전문: docs/01-research/03-dts-plugin-review.md
       */
      dts: false,
      exposes: {
        "./ProductGrid": "./src/exposes/ProductGrid.tsx",
        "./ProductDetail": "./src/exposes/ProductDetail.tsx",
      },
      shared: {
        react: { singleton: true, requiredVersion: "^19.0.0" },
        "react-dom": { singleton: true, requiredVersion: "^19.0.0" },
      },
    }),
  ],
  server: {
    port: PORT,
    strictPort: true,
    // host(3000) 에서 교차 출처로 remoteEntry 를 받아야 하므로 CORS 허용
    cors: true,
    origin: `http://localhost:${PORT}`,
  },
  preview: {
    port: PORT,
    strictPort: true,
    cors: true,
  },
  /**
   * dev 전용이지만 매우 중요하다.
   *
   * Vite 는 기본적으로 **요청이 들어온 뒤에** 의존성을 발견해 사전 번들링한다.
   * 일반 앱이라면 최적화가 끝난 뒤 Vite HMR 클라이언트가 페이지를 새로고침해 정상화된다.
   * 그런데 remote 는 **host(3000) 페이지 안에서** 로드되므로 그 새로고침이 오지 않는다.
   * 결과: catalog 를 처음 로드한 페이지에서만 interop 이 깨진 모듈이 남아
   * `_jsxDEV is not a function` 이 터지고, 다음 내비게이션부터는 멀쩡해진다.
   *
   * exposes 를 스캔 진입점으로 지정하고 react 계열을 미리 포함시켜
   * dev 서버 기동 시점에 사전 번들링을 끝내면 이 창이 사라진다.
   */
  optimizeDeps: {
    entries: ["src/exposes/*.tsx", "src/main.tsx"],
    include: [
      "react",
      "react-dom",
      "react-dom/client",
      "react/jsx-runtime",
      "react/jsx-dev-runtime",
    ],
  },
  base: `http://localhost:${PORT}/`,
  build: {
    // Module Federation 은 top-level await 를 사용한다
    target: "chrome89",
    minify: false,
    cssCodeSplit: false,
  },
});
