import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { federation } from "@module-federation/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Connect, type Plugin } from "vite";

const PORT = 3001;

/**
 * 빌드 버전. `scripts/mf-build-version.mjs` 가 빌드 직전에 써 둔다.
 *
 * 이 값이 자산 URL 접두사와 출력 디렉터리를 동시에 결정한다. 그래서 **웹 자산까지**
 * `/v<version>/` 아래 불변 경로로 나가고, 재배포가 기존 URL 을 덮어쓰지 않는다.
 * (버전이 내용 해시가 아니라 빌드 ID 인 이유는 mf-build-version.mjs 주석 참고)
 *
 * dev 서버는 버전 경로를 쓰지 않는다 — 매 저장마다 경로가 바뀌면 의미가 없다.
 */
function buildVersion(): string | null {
  const file = resolve(process.cwd(), ".mf-version");
  if (!existsSync(file)) return null;
  return readFileSync(file, "utf8").trim();
}

/**
 * SSR 번들을 dev 서버에서 내려준다.
 * 웹 번들은 dev 에서 메모리로 서빙되지만 SSR 번들은 watch 빌드가 디스크에 쓰므로 직접 읽는다.
 *
 * dev 전용이다. 빌드 산출물은 `scripts/serve-remote-dist.mjs` 가 서빙한다.
 *   /mf-server.cjs    — dev watch 빌드가 디스크에 쓰는 버전 없는 번들
 *   /mf-version.json  — 있으면 내려준다(직전 빌드 산출물). dev 에서는 보통 없다
 */
const SERVED = /^\/(mf-server\.cjs|mf-version\.json)$/;

function serveSsrBundle(): Plugin {
  const middleware: Connect.NextHandleFunction = (req, res, next) => {
    const path = req.url?.split("?")[0] ?? "";
    if (!SERVED.test(path)) return next();

    try {
      const body = readFileSync(resolve(process.cwd(), `dist${path}`), "utf8");
      res.setHeader(
        "Content-Type",
        path.endsWith(".json")
          ? "application/json; charset=utf-8"
          : "application/javascript; charset=utf-8",
      );
      res.setHeader("Access-Control-Allow-Origin", "*");
      // 버전 경로는 불변이라 오래 캐시해도 되지만, 로컬 실험에서는 혼동만 키운다
      res.setHeader("Cache-Control", "no-store");
      res.end(body);
    } catch {
      res.statusCode = 404;
      res.end("// 아직 없습니다. `pnpm build` (stamp 포함) 또는 dev watch 빌드를 확인하세요.");
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
export default defineConfig(({ command }) => {
  /**
   * dev 는 버전 경로를 쓰지 않는다. 매 저장마다 경로가 바뀌면 의미가 없고,
   * dev 서버는 메모리에서 서빙하므로 불변성도 필요 없다.
   */
  const version = command === "build" ? buildVersion() : null;
  const base = version ? `http://localhost:${PORT}/v${version}/` : `http://localhost:${PORT}/`;

  return {
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
  base,
  build: {
    // 웹 자산 전체를 버전 디렉터리로 내보낸다 → 배포된 URL 은 다시 바뀌지 않는다
    outDir: version ? `dist/v${version}` : "dist",
    // Module Federation 은 top-level await 를 사용한다
    target: "chrome89",
    minify: false,
    cssCodeSplit: false,
  },
  };
});
