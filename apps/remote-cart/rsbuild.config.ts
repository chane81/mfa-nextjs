import { resolve } from 'node:path';

import { pluginModuleFederation } from '@module-federation/rsbuild-plugin';
import { MF_FILES, REMOTES, publicOrigin } from '@mfa/remote-config';
import {
  assetBase,
  createMfDevMiddleware,
  readBuildVersion,
  versionedDist,
} from '@mfa/remote-config/node';
import { defineConfig } from '@rsbuild/core';
import { pluginReact } from '@rsbuild/plugin-react';

// 이름이 `REMOTES` 의 키다. 상수로 뽑아 두면 오타는 `REMOTES[NAME]` 이 잡는다.
const NAME = 'cart';
const REMOTE = REMOTES[NAME];
const PORT = REMOTE.devPort;
const DIST = resolve(process.cwd(), 'dist');
/**
 * 이 remote 가 배포된 **공개 오리진**. assetPrefix 가 여기서 나온다.
 *
 * host 는 자기 도메인에서 이 remote 의 청크를 받아간다. 상대 경로면 브라우저가
 * host 도메인에서 청크를 찾으므로 절대 URL 이어야 한다.
 *
 * 값은 `REMOTE_CART_PUBLIC_URL` 에서 오고, env 이름과 로컬 기본값은
 * `@mfa/remote-config` 가 들고 있다. 빌드 시점에 굳는 값이라 배포 파이프라인에서
 * 빌드 인자로 넘긴다. (docs/03-setup/04-dokploy.md)
 */
const PUBLIC_URL = publicOrigin(NAME);

/**
 * 빌드 버전과 그로부터 파생되는 경로들.
 *
 * 판정(`.mf-version` 이 없거나 **비어 있으면** 버전 없음)과 조립은
 * `@mfa/remote-config/node` 가 쥔다. 예전에는 여기가 존재 여부만 봤고 SSR 빌드 설정은
 * 빈 값까지 걸렀다 — 두 산출물이 다른 디렉터리로 나갈 수 있는 갈라짐이었다.
 */
const VERSION = readBuildVersion();
const ASSET_PREFIX = assetBase(PUBLIC_URL, VERSION);
const DIST_ROOT = versionedDist(VERSION);

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
      name: NAME,
      filename: 'remoteEntry.js',
      exposes: {
        './CartPanel': './src/exposes/CartPanel.tsx',
        './CartBadge': './src/exposes/CartBadge.tsx',
        './CheckoutFlow': './src/exposes/CheckoutFlow.tsx',
      },
      shared: {
        react: { singleton: true, requiredVersion: '^19.0.0' },
        'react-dom': { singleton: true, requiredVersion: '^19.0.0' },
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
    cors: { origin: '*' },
    /**
     * SSR 번들을 서버에서 직접 내려준다.
     *
     * 웹 번들은 메모리에서 서빙되지만 이 파일은 watch 빌드가 디스크에 쓰므로 직접 읽는다.
     * 서빙 대상 목록과 응답 규칙은 `@mfa/remote-config/node` 가 쥔다 —
     * catalog(Vite)와 **글자 그대로 같은 로직**이었고, 갈라지면 remote 별로 dev 동작이
     * 달라진다. 여기 남는 건 훅이 알려준 서버 종류 하나다.
     *
     * `action` 으로 dev 와 preview 를 가른다. 이 훅은 **양쪽 모두에서** 호출되는데,
     * 버전 공표(`mf-version.json`)는 dev 에 없고 preview(빌드 산출물)에는 있다.
     * 구분하지 않으면 preview 가 자기 매니페스트를 404 로 감춘다.
     *
     * 옛 `dev.setupMiddlewares` 는 Rsbuild 2 에서 deprecated 다 (기동 시 경고 출력).
     */
    setup: ({ server, action }) => {
      server.middlewares.use(
        createMfDevMiddleware({
          dist: DIST,
          kind: action === 'dev' ? 'dev' : 'preview',
        }),
      );
    },
  },
  dev: {
    // 청크가 3002 절대경로로 로드되도록 고정
    assetPrefix: PUBLIC_URL,
  },
  output: {
    assetPrefix: ASSET_PREFIX,
    // 웹 자산 전체를 버전 디렉터리로 내보낸다 → 배포된 URL 은 다시 바뀌지 않는다
    distPath: {
      root: DIST_ROOT,
      /**
       * CSS 를 `static/css/` 가 아니라 루트에 낸다. host 가 가리킬 주소를
       * `@mfa/remote-config` 가 조립하는데(`stylesPath`), 그 조립식에 번들러별 디렉터리
       * 규칙이 들어가면 계약이 catalog(Vite)와 갈라진다.
       */
      css: '',
    },
    /**
     * CSS 파일명에서 해시를 뺀다 — 이유는 `MF_FILES.styles` 주석 참고.
     * 이 앱의 CSS 는 진입점 하나에서 나오는 한 덩어리라 이름 충돌이 없다.
     */
    filename: { css: MF_FILES.styles },
  },
});
