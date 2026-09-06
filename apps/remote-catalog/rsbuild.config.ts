import { resolve } from 'node:path';

import { pluginModuleFederation } from '@module-federation/rsbuild-plugin';
import {
  MF_FILES,
  MF_TYPES_FOLDER,
  REMOTES,
  publicOrigin,
} from '@mfa/remote-config';
import {
  assetBase,
  EXPOSE_SCAN,
  createMfDevMiddleware,
  readBuildVersion,
  readExposes,
  versionedDist,
} from '@mfa/remote-config/node';
import { defineConfig } from '@rsbuild/core';
import { pluginReact } from '@rsbuild/plugin-react';

// 이름이 `REMOTES` 의 키다. 상수로 뽑아 두면 오타는 `REMOTES[NAME]` 이 잡는다.
const NAME = 'catalog';
const REMOTE = REMOTES[NAME];
const PORT = REMOTE.devPort;
const DIST = resolve(process.cwd(), 'dist');

/**
 * 이 remote 가 노출하는 것 — **`src/exposes/` 를 읽어서 정한다.**
 *
 * 손으로 적으면 파일을 추가할 때마다 여기도 같이 고쳐야 하고, 빠뜨리면 "파일은 있는데
 * host 가 못 찾는" 상태가 된다. 스캔과 제외 규칙은 `@mfa/remote-config/node` 의
 * `EXPOSE_SCAN` 이 쥔다 — cart 와 `gen-module-ids.test.ts` 가 같은 값을 봐야 하기
 * 때문이다. 이 저장소는 테스트를 대상 소스 옆에 두므로 거르지 않으면
 * `exposes.test.tsx` 가 remote 의 공개 계약에 올라간다(known-issues H-2).
 * 스캔 결과가 커밋된 `MODULE_IDS` 와 어긋나면 그 테스트가 잡는다.
 */
const EXPOSED = readExposes(EXPOSE_SCAN.dir, { ignore: EXPOSE_SCAN.ignore });

/**
 * 이 remote 가 배포된 **공개 오리진**. assetPrefix 가 여기서 나온다.
 *
 * host 는 자기 도메인에서 이 remote 의 청크를 받아간다. 상대 경로면 브라우저가
 * host 도메인에서 청크를 찾으므로 절대 URL 이어야 한다.
 *
 * 값은 `REMOTE_CATALOG_PUBLIC_URL` 에서 오고, env 이름과 로컬 기본값은
 * `@mfa/remote-config` 가 들고 있다. 빌드 시점에 굳는 값이라 배포 파이프라인에서
 * 빌드 인자로 넘긴다. (docs/03-setup/04-dokploy.md)
 */
const PUBLIC_URL = publicOrigin(NAME);

/**
 * 빌드 버전과 그로부터 파생되는 경로들.
 *
 * 판정(`.mf-version` 이 없거나 **비어 있으면** 버전 없음)과 조립은
 * `@mfa/remote-config/node` 가 쥔다.
 */
const VERSION = readBuildVersion();
const ASSET_PREFIX = assetBase(PUBLIC_URL, VERSION);
const DIST_ROOT = versionedDist(VERSION);

/**
 * catalog remote — Rsbuild(Rspack) + @module-federation/rsbuild-plugin
 *
 * nextjs-mf(webpack) 를 쓰지 않는 이유는 docs/01-research 참고.
 * remote 쪽은 번들러가 자유롭기 때문에 Rsbuild 로 빌드하고,
 * host(Next.js 16 / Turbopack) 는 런타임 API 로만 이 remote 를 소비한다.
 */
export default defineConfig({
  plugins: [
    pluginReact(),
    pluginModuleFederation({
      name: NAME,
      filename: 'remoteEntry.js',
      exposes: EXPOSED.exposes,
      shared: {
        react: { singleton: true, requiredVersion: '^19.0.0' },
        'react-dom': { singleton: true, requiredVersion: '^19.0.0' },
      },
      /**
       * MF 자동 타입 생성(DTS)을 **켠다.**
       *
       * 이 remote 는 생산자다 — 자기 `exposes` 의 시그니처를 컴파일해 `@mf-types.zip` ·
       * `@mf-types.d.ts` 로 내보내고, host 가 `mf dts --fetch` 로 받아간다.
       *
       * ## 그래도 `@mfa/contracts` 가 SSOT 다
       *
       * 여기서 나온 타입이 host 의 모듈 타입을 **그대로 만든다**
       * (`packages/contracts/src/remote-contract.ts`). `@mfa/contracts` 에 남은 건
       * **어휘**(`Product` 등)와 **런타임 이름 목록**(`MODULE_IDS`)뿐이다. props 를
       * 그쪽으로 올리면 host 와 이 remote 가 같은 선언을 가리키게 되어 DTS 가 전달할
       * 정보가 0 이 된다(known-issues I-2).
       *
       * ⚠️ **옵션 값은 cart 와 같아야 한다.** 갈라지면 한쪽 remote 만 다른 모양의 타입을
       * 내보내고, host 는 그걸 같은 방식으로 소비하려다 실패한다.
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
           * `@mfa/contracts` 를 타입 아카이브에 인라인하지 않는다. host 도 같은
           * 워크스페이스라 그 패키지를 직접 해석할 수 있고, 인라인하면 계약의 원본이
           * 두 벌이 된다. 지금은 필요 없다 — props 가 이 파일들 안에 있으므로 DTS 가
           * 이미 실제 시그니처를 인라인해서 보낸다.
           */
          extractThirdParty: false,
        },
        // 이 remote 는 다른 remote 를 소비하지 않는다 — 받을 타입이 없다
        consumeTypes: false,
      },
      dev: {
        // WS 기반 동적 타입 힌트만 끈다 (`[ dynamic-remote-type-hints-plugin ] err: [object Event]`)
        disableDynamicRemoteTypeHints: true,
      },
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
     * 서빙 대상 목록과 응답 규칙은 `@mfa/remote-config/node` 가 쥔다 — 두 remote 가
     * 갈라지면 remote 별로 dev 동작이 달라진다.
     *
     * `action` 으로 dev 와 preview 를 가른다. 이 훅은 **양쪽 모두에서** 호출되는데,
     * 버전 공표(`mf-version.json`)는 dev 에 없고 preview(빌드 산출물)에는 있다.
     * 구분하지 않으면 preview 가 자기 매니페스트를 404 로 감춘다.
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
    // 청크가 3001 절대경로로 로드되도록 고정
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
       * 규칙이 들어가면 계약이 갈라진다.
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
