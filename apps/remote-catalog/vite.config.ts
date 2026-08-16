import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { federation } from '@module-federation/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, type Connect, type Plugin } from 'vite';

const PORT = 3001;

/**
 * 이 remote 가 배포된 **공개 오리진**. 자산 URL 접두사(`base`)가 여기서 나온다.
 *
 * host 는 자기 도메인에서 이 remote 의 청크를 받아간다. 그래서 상대 경로로는 안 되고
 * 절대 URL 이어야 한다 — 상대 경로면 브라우저가 host 도메인에서 청크를 찾는다.
 *
 * 빌드 시점에 굳는 값이라 배포 파이프라인에서 빌드 인자로 넘겨야 한다.
 * (docs/03-setup/04-dokploy.md)
 */
const PUBLIC_URL = (
  process.env.REMOTE_CATALOG_PUBLIC_URL || `http://localhost:${PORT}`
).replace(/\/+$/, '');

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
  const file = resolve(process.cwd(), '.mf-version');
  if (!existsSync(file)) return null;
  return readFileSync(file, 'utf8').trim();
}

/**
 * SSR 번들을 dev 서버에서 내려준다.
 * 웹 번들은 dev 에서 메모리로 서빙되지만 SSR 번들은 watch 빌드가 디스크에 쓰므로 직접 읽는다.
 *
 * dev 전용이다. 빌드 산출물은 `scripts/serve-remote-dist.mjs` 가 서빙한다.
 *   /mf-server.cjs — dev watch 빌드가 디스크에 쓰는 버전 없는 번들
 *
 * **`mf-version.json` 은 일부러 빼 둔다.** dev 는 버전 경로로 배포하지 않는데,
 * 직전 `pnpm build` 가 남긴 파일을 내려주면 하지도 않은 배포를 공표하게 된다.
 * 그러면 host 가 `/v<ver>/mf-server.cjs` 를 요청하고, dev 서버는 그 경로를 모르니
 * SPA 폴백(200)을 돌려주며, 그 바이트가 공표된 해시와 달라 무결성 검사에서 죽는다.
 *
 *   Error: remote 'catalog' 번들 무결성 불일치 (공표=sha384-…, 실제=sha384-…)
 *
 * 안 내려주면 host 는 버전을 모르는 상태가 되어 버전 없는 엔트리로 폴백한다.
 * 그게 dev 에서 의도된 경로다(`server-loader.ts` 의 `resolveEntry` 주석).
 */
const SERVED = /^\/mf-server\.cjs$/;

/** preview 는 빌드 산출물을 서빙하는 자리라 버전 공표도 의미가 있다 */
const SERVED_IN_PREVIEW = /^\/(mf-server\.cjs|mf-version\.json)$/;

/**
 * dev 에 존재하지 않는 배포 개념. 그냥 next() 로 흘리면 Vite 의 SPA 폴백이
 * `index.html` 을 200 으로 돌려주고, host 는 그걸 매니페스트로 파싱하려다 실패한다.
 * 결과는 같지만(폴백) 원인이 로그에서 사라진다. 여기서 명시적으로 404 를 준다.
 */
const NOT_IN_DEV = /^\/mf-version\.json$/;

/**
 * 이 미들웨어가 어느 서버에 붙었는지.
 *
 * env 로 판별하지 않는다. Vite 가 `configureServer` 는 dev 서버에만,
 * `configurePreviewServer` 는 preview 에만 부르므로 **훅 자체가 판별자**다.
 * 다른 방법은 전부 이 구분을 못 한다.
 *
 *   process.env.NODE_ENV — config 는 셸 env 를 물려받아 평가되고,
 *                          `pnpm dev` 는 `vite dev` 와 `vite build --watch` 를 동시에 돌린다
 *   command === "serve"  — dev 와 preview 가 둘 다 serve 다 (구분 불가)
 */
type ServerKind = 'dev' | 'preview';

function serveSsrBundle(): Plugin {
  const middlewareFor =
    (kind: ServerKind): Connect.NextHandleFunction =>
    (req, res, next) => {
      const path = req.url?.split('?')[0] ?? '';
      const dev = kind === 'dev';

      if (dev && NOT_IN_DEV.test(path)) {
        res.statusCode = 404;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.end(
          '{"error":"dev 에는 버전 공표가 없습니다. host 는 버전 없는 엔트리로 폴백합니다."}',
        );
        return;
      }

      if (!(dev ? SERVED : SERVED_IN_PREVIEW).test(path)) return next();

      try {
        const body = readFileSync(
          resolve(process.cwd(), `dist${path}`),
          'utf8',
        );
        res.setHeader(
          'Content-Type',
          path.endsWith('.json')
            ? 'application/json; charset=utf-8'
            : 'application/javascript; charset=utf-8',
        );
        res.setHeader('Access-Control-Allow-Origin', '*');
        // 버전 경로는 불변이라 오래 캐시해도 되지만, 로컬 실험에서는 혼동만 키운다
        res.setHeader('Cache-Control', 'no-store');
        res.end(body);
      } catch {
        res.statusCode = 404;
        res.end(
          '// 아직 없습니다. `pnpm build` (stamp 포함) 또는 dev watch 빌드를 확인하세요.',
        );
      }
    };

  return {
    name: 'mfa-serve-ssr-bundle',
    configureServer: (server) => {
      server.middlewares.use(middlewareFor('dev'));
    },
    configurePreviewServer: (server) => {
      server.middlewares.use(middlewareFor('preview'));
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
  const version = command === 'build' ? buildVersion() : null;
  const base = version ? `${PUBLIC_URL}/v${version}/` : `${PUBLIC_URL}/`;

  return {
    plugins: [
      react(),
      serveSsrBundle(),
      federation({
        name: 'catalog',
        filename: 'remoteEntry.js',
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
          './ProductGrid': './src/exposes/ProductGrid.tsx',
          './ProductDetail': './src/exposes/ProductDetail.tsx',
        },
        shared: {
          react: { singleton: true, requiredVersion: '^19.0.0' },
          'react-dom': { singleton: true, requiredVersion: '^19.0.0' },
        },
      }),
    ],
    server: {
      port: PORT,
      strictPort: true,
      // host(3000) 에서 교차 출처로 remoteEntry 를 받아야 하므로 CORS 허용
      cors: true,
      origin: PUBLIC_URL,
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
      entries: ['src/exposes/*.tsx', 'src/main.tsx'],
      include: [
        'react',
        'react-dom',
        'react-dom/client',
        'react/jsx-runtime',
        'react/jsx-dev-runtime',
      ],
    },
    base,
    build: {
      // 웹 자산 전체를 버전 디렉터리로 내보낸다 → 배포된 URL 은 다시 바뀌지 않는다
      outDir: version ? `dist/v${version}` : 'dist',
      // Module Federation 은 top-level await 를 사용한다
      target: 'chrome89',
      minify: false,
      cssCodeSplit: false,
    },
  };
});
