import { resolve } from 'node:path';

import { federation } from '@module-federation/vite';
import {
  MF_FILES,
  MF_TYPES_FOLDER,
  REMOTES,
  publicOrigin,
} from '@mfa/remote-config';
import {
  assetBase,
  createMfDevMiddleware,
  readBuildVersion,
  readExposes,
  versionedDist,
} from '@mfa/remote-config/node';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

// 이름이 `REMOTES` 의 키다. 상수로 뽑아 두면 오타는 `REMOTES[NAME]` 이 잡는다.
const NAME = 'catalog';
const REMOTE = REMOTES[NAME];
const PORT = REMOTE.devPort;

/**
 * 이 remote 가 노출하는 것 — **`src/exposes/` 를 읽어서 정한다.**
 *
 * 손으로 적으면 파일을 추가할 때마다 여기도 같이 고쳐야 하고, 빠뜨리면 "파일은 있는데
 * host 가 못 찾는" 상태가 된다. 규칙은 이미 "이 폴더에 있는 것만 노출한다" 하나뿐이라
 * 그 규칙을 설정에 다시 적지 않는다. 스캔은 `@mfa/remote-config/node` 가 쥔다 —
 * cart(Rsbuild)와 같은 판단이어야 하기 때문이다.
 *
 * ## 제외 규칙을 여기 적는 이유
 *
 * 이 저장소는 **테스트를 대상 소스 옆에 둔다**(`docs/06-testing/01-test-plan.md`).
 * 그래서 이 폴더에는 expose 가 아닌 이웃 파일이 같이 산다(`exposes.test.tsx`).
 * 거르지 않으면 remote 의 공개 계약이 조용히 늘어나고, dev 에서는 사전 transform 까지
 * 시도하다 `@tests/*` alias 를 못 찾고 터진다.
 *
 *     Pre-transform error: Failed to resolve import "@tests/helpers/globals"
 *     from "src/exposes/exposes.test.tsx"
 *
 * alias 를 여기 추가하는 건 답이 아니다 — 테스트는 애초에 dev 모듈 그래프에 들어갈
 * 파일이 아니다. **dev 가 볼 게 아닌 이웃 파일이 또 생기면 아래 배열에 한 줄 더 넣는다**
 * (`/\.stories\.tsx$/` 같은 것). 기록: known-issues H-2.
 *
 * 스캔 결과가 `@mfa/contracts` 의 계약과 어긋나면 `src/exposes/contract.test.ts` 가 잡는다.
 */
const EXPOSED = readExposes('./src/exposes', {
  ignore: [/\.test\.tsx$/],
});

/**
 * 이 remote 가 배포된 **공개 오리진**. 자산 URL 접두사(`base`)가 여기서 나온다.
 *
 * host 는 자기 도메인에서 이 remote 의 청크를 받아간다. 그래서 상대 경로로는 안 되고
 * 절대 URL 이어야 한다 — 상대 경로면 브라우저가 host 도메인에서 청크를 찾는다.
 *
 * 값은 `REMOTE_CATALOG_PUBLIC_URL` 에서 오고, env 이름과 로컬 기본값은
 * `@mfa/remote-config` 가 들고 있다. 빌드 시점에 산출물에 굳는 값이라
 * 배포 파이프라인에서 빌드 인자로 넘겨야 한다. (docs/03-setup/04-dokploy.md)
 */
const PUBLIC_URL = publicOrigin(NAME);

/**
 * dev · preview 서버가 SSR 번들(과 preview 에서는 버전 공표까지)을 디스크에서 내려준다.
 *
 * 서빙 대상 목록과 응답 규칙은 `@mfa/remote-config/node` 가 쥔다 — cart(Rsbuild)와
 * **글자 그대로 같은 로직**이었고, 갈라지면 remote 별로 dev 동작이 달라진다.
 * 여기 남는 건 "어느 훅이 어느 종류의 서버인가" 하나다.
 *
 * env 로 판별하지 않는 이유: Vite 가 `configureServer` 는 dev 서버에만,
 * `configurePreviewServer` 는 preview 에만 부르므로 **훅 자체가 판별자**다.
 * 다른 방법은 전부 이 구분을 못 한다.
 *
 *   process.env.NODE_ENV — config 는 셸 env 를 물려받아 평가되고,
 *                          `pnpm dev` 는 `vite dev` 와 `vite build --watch` 를 동시에 돌린다
 *   command === "serve"  — dev 와 preview 가 둘 다 serve 다 (구분 불가)
 */
function serveSsrBundle(): Plugin {
  const dist = resolve(process.cwd(), 'dist');

  return {
    name: 'mfa-serve-ssr-bundle',
    configureServer: (server) => {
      server.middlewares.use(createMfDevMiddleware({ dist, kind: 'dev' }));
    },
    configurePreviewServer: (server) => {
      server.middlewares.use(createMfDevMiddleware({ dist, kind: 'preview' }));
    },
  };
}

/**
 * dev 에서 `/style.css` 를 **순수 CSS 로** 내려준다.
 *
 * host 는 dev 든 배포든 똑같이 `<link rel="stylesheet" href=".../style.css">` 를
 * 건다(`RemoteComponent`). 그런데 dev 의 Vite 는 CSS 를 파일로 내보내지 않는다 — HMR 을 위해
 * `<style>` 을 주입하는 **JS 모듈**로 감싸서 서빙한다. 그 응답을 `<link>` 로 받으면
 * 브라우저가 JavaScript 를 스타일시트로 해석하려다 통째로 무시한다(에러도 안 난다).
 *
 * `?direct` 는 그 JS 래퍼를 벗기고 변환된 CSS 본문만 달라는 Vite 의 내부 쿼리다.
 * 여기서 그걸 한 번 대신 요청해 `text/css` 로 돌려주면 주소 하나로 dev 와 배포가 같아진다.
 *
 * dev 전용이다. 빌드 산출물의 `/style.css` 는 실제 파일이고
 * `scripts/serve-remote-dist.ts` 가 서빙한다.
 */
function serveDevStylesheet(): Plugin {
  return {
    name: 'mfa-serve-dev-stylesheet',
    configureServer: (server) => {
      server.middlewares.use((req, res, next) => {
        if ((req.url?.split('?')[0] ?? '') !== `/${MF_FILES.styles}`) {
          next();
          return;
        }

        server
          .transformRequest('/src/styles.css?direct')
          .then((result) => {
            if (!result) {
              res.statusCode = 404;
              res.end('/* src/styles.css 를 변환하지 못했습니다 */');
              return;
            }
            res.setHeader('Content-Type', 'text/css; charset=utf-8');
            // host(3000) 페이지가 교차 출처로 이 스타일시트를 받아간다
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Cache-Control', 'no-store');
            res.end(result.code);
          })
          .catch((error: unknown) => {
            res.statusCode = 500;
            res.end(`/* ${String(error)} */`);
          });
      });
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
  const version = command === 'build' ? readBuildVersion() : null;
  // Vite 의 `base` 는 뒤 슬래시가 있어야 마지막 세그먼트를 디렉터리로 본다
  const base = assetBase(PUBLIC_URL, version, { trailingSlash: true });

  return {
    plugins: [
      react(),
      tailwindcss(),
      serveSsrBundle(),
      serveDevStylesheet(),
      federation({
        name: NAME,
        filename: 'remoteEntry.js',
        // mf-manifest.json 을 내보내야 host 런타임이 포맷/공유 정보를 자동 판별한다
        manifest: true,
        /**
         * MF 자동 타입 생성(DTS)을 **켠다.**
         *
         * 이 remote 는 생산자다 — 자기 `exposes` 의 시그니처를 컴파일해
         * `@mf-types.zip` · `@mf-types.d.ts` 로 내보내고, host 가 `mf dts --fetch` 로 받아간다.
         * 산출물은 웹 번들과 **같은 버전 디렉터리**(`dist/v<version>/`)로 나간다 —
         * `outputDir` 을 따로 주지 않고 Vite 의 `build.outDir` 을 그대로 쓰기 때문이다.
         * 매니페스트의 `metaData.types` 에 실리는 경로도 그 `base` 기준 상대경로다.
         *
         * ## 그래도 `@mfa/contracts` 가 SSOT 다
         *
         * 여기서 나온 타입이 host 의 모듈 타입을 **그대로 만든다**
         * (`packages/contracts/src/remote-contract.ts`). 그래서 이 remote 가 props 를 바꾸면
         * host 의 호출부가 컴파일 에러가 된다.
         *
         * `@mfa/contracts` 에 남은 건 **어휘**(`Product` 등)와 **런타임 이름 목록**
         * (`MODULE_IDS`)뿐이다. props 를 그쪽으로 올리면 host 와 이 remote 가 같은
         * 선언을 가리키게 되어 DTS 가 전달할 정보가 0 이 된다(known-issues I-2).
         *
         * ## `dev` 를 함께 끄는 이유
         *
         * `[ dynamic-remote-type-hints-plugin ] err: [object Event]` 는 dts 가 아니라
         * **dev 옵션** 소관이다(`DevPlugin` 이 `isDev()` 에서 WS 런타임 플러그인을 주입한다).
         * DTS 는 켜되 그 WS 만 끈다.
         *
         * 검토 전문: docs/01-research/03-dts-plugin-review.md
         */
        dts: {
          generateTypes: {
            /**
             * 이 remote 의 tsconfig 로 컴파일한다. `noEmit: true` 라도 상관없다 —
             * dts-plugin 이 임시 tsconfig 를 만들어 `declaration` 을 켜고 돌린다.
             */
            tsConfigPath: './tsconfig.json',
            /**
             * 폴더 이름은 계약이다. host 가 받을 zip · API 파일명(`MF_FILES.typesApi` ·
             * `typesArchive`)이 같은 상수에서 파생되므로 여기만 바꿔서 어긋날 수 없다.
             */
            typesFolder: MF_TYPES_FOLDER,
            /** `RemoteKeys` · `PackageType` — host 의 `loadRemote()` 모듈 확장이 이걸 쓴다 */
            generateAPITypes: true,
            /**
             * 타입 생성이 실패하면 빌드를 세운다. 조용히 넘어가면 host 는 타입이 없는 게
             * 아니라 **옛 타입**을 계속 쓰게 되고, 그 상태가 CI 를 통과한다.
             */
            abortOnError: true,
            /**
             * `@mfa/contracts` 를 타입 아카이브에 인라인하지 않는다.
             *
             * host 도 같은 워크스페이스라 그 패키지를 직접 해석할 수 있고, 인라인하면
             * 계약의 원본이 두 벌이 된다.
             *
             * ⚠️ **이 저장소에서는 켜도 동작하지 않는다.**(실측) `third-party-dts-extractor`
             * 가 `require.resolve(pkg, …)` 로 패키지를 찾는데, `@mfa/contracts` 는
             * `type: module` 에 `exports` 에 `require` 조건이 없는 ESM 전용 워크스페이스
             * 패키지라 그 해석이 실패한다. `extractThirdParty: true` 로 빌드해도 산출물은
             * 그대로였다 — 여전히 `import { type ProductGridProps } from '@mfa/contracts'`.
             *
             * 지금은 필요 없다 — props 가 이 파일들 안에 있으므로 DTS 가 이미 실제
             * 시그니처를 인라인해서 보낸다. 이 값이 필요해지는 건 remote 가
             * **다른 저장소로 나가서** `@mfa/contracts` 의 어휘(`Product` 등)까지
             * 실어 보내야 하는 날이고, 그때는 계약 패키지를 CJS 도 내보내게 만들어야 한다.
             */
            extractThirdParty: false,
          },
          // 이 remote 는 다른 remote 를 소비하지 않는다 — 받을 타입이 없다
          consumeTypes: false,
        },
        dev: {
          // WS 기반 동적 타입 힌트만 끈다 (위 주석의 `[object Event]`)
          disableDynamicRemoteTypeHints: true,
        },
        exposes: EXPOSED.exposes,
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
      /**
       * exposes 를 **기동 시점에 미리 transform 해 둔다.** dev 전용이다.
       *
       * ## 왜 필요한가 — `_jsxDEV is not a function`
       *
       * `@module-federation/vite` 가 만드는 expose 로더는 shared 대기를
       * `import()` **뒤에** 둔다(1.20.7 실측).
       *
       * ```js
       * // virtual:mf-exposes:…
       * "./ProductGrid": async () => {
       *   await Promise.all([])                                  // ← 비어 있다
       *   const importModule = await loadExposedModule(
       *     "./ProductGrid",
       *     () => import("/src/exposes/ProductGrid.tsx")          // ← 여기서 loadShare 가 평가된다
       *   )
       *   if (dependencyPending?.then) await dependencyPending;   // ← 배리어가 import 뒤
       * }
       * ```
       *
       * `ProductGrid.tsx` 는 `jsxDEV` 를 **정적 import** 한다(automatic JSX runtime).
       * 그래서 `import()` 되는 순간 loadShare 모듈이 평가되고, 그 시점에 공유 스코프가
       * 아직 비어 있으면 `jsxDEV` 를 `undefined` 인 채로 export 한다. 뒤늦게 배리어를
       * await 해도 그 전에 React 가 렌더하면 터진다.
       *
       * 콜드 로드 실측(ms):
       *
       *   280→285  /src/exposes/ProductGrid.tsx
       *   286→293  loadShare(react/jsx-dev-runtime)     ← 캐시 miss, undefined 로 굳는다
       *   311→313  .vite/deps/react_jsx-dev-runtime.js  ← 실제 모듈은 20ms 뒤
       *
       * 미리 transform 해 두면 이 구간이 사라진다. 대상은 `EXPOSED.files` 다 —
       * expose 와 **같은 목록**이라 워밍이 expose 를 놓치는 경우가 성립하지 않는다.
       *
       * 실측: 워밍 없이 2/2 실패,
       * 워밍 후 4/4 성공(dev 재시작 + 새 브라우저 세션 기준).
       *
       * ## `optimizeDeps` 와 겹치지 않는다
       *
       * 아래 `optimizeDeps` 는 **의존성**(react 등)의 사전 번들링이고, 이건 **소스 파일**의
       * 사전 transform 이다. 서로 다른 단계라 둘 다 필요하다.
       *
       * ## 왜 host 쪽 게이트로는 못 막나
       *
       * `scripts/wait-for-remotes.ts` 는 매니페스트와 remoteEntry 가 200 을 주는지까지만
       * 본다. 이 레이스는 HTTP 가 아니라 **브라우저 안 모듈 평가 순서**에서 나므로 그 게이트를
       * 통과한 뒤에 터진다. 게다가 catalog 의 매니페스트는 dev 모듈 URL 을 싣지 않아
       * (`assets.js.sync` 가 `remoteEntry.js` 뿐) 게이트가 이 파일들을 알 방법도 없다.
       * 그래서 remote 자기 설정으로 푼다 — host 와 결합이 생기지 않는다.
       *
       * https://vite.dev/config/server-options#server-warmup
       */
      warmup: {
        clientFiles: EXPOSED.files,
      },
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
     * 그래서 exposes 를 스캔 진입점으로 지정하고 react 계열을 미리 포함시켜
     * 기동 시점에 사전 번들링을 끝낸다.
     *
     * ⚠️ **이것만으로는 `_jsxDEV is not a function` 이 안 막힌다.** 한때 그렇게 적혀 있었고,
     * 그 상태로 재발했다. 이건 **의존성**의 사전 번들링이고, 그 에러는 **소스 파일**의
     * transform 이 늦어서 나므로 단계가 다르다. 그쪽은 위 `server.warmup` 이 맡는다.
     * 둘 다 필요하다 — 자세한 내용은 `server.warmup` 주석과
     * docs/05-troubleshooting/01-known-issues.md 의 0-4c.
     */
    optimizeDeps: {
      entries: [...EXPOSED.files, './src/main.tsx'],
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
      outDir: versionedDist(version),
      // Module Federation 은 top-level await 를 사용한다
      target: 'chrome89',
      minify: false,
      /**
       * CSS 를 한 파일로 모은다. expose 마다 CSS 가 쪼개지면 컴포넌트가 가리킬 주소가
       * 여러 개가 되고, 그 목록을 다시 계약으로 만들어야 한다.
       */
      cssCodeSplit: false,
      rollupOptions: {
        output: {
          /**
           * CSS 파일명에서 해시를 뺀다. host 가 이 주소를 계산으로 알아야 하기
           * 때문이다 (`MF_FILES.styles` 주석 참고).
           * 캐시 무효화는 이미 `/v<version>/` 불변 경로가 맡고 있다.
           *
           * CSS 만 고정하고 나머지 자산은 기본 해시 규칙을 그대로 둔다.
           */
          assetFileNames: (asset) =>
            asset.names?.some((name) => name.endsWith('.css'))
              ? MF_FILES.styles
              : 'assets/[name]-[hash][extname]',
        },
      },
    },
  };
});
