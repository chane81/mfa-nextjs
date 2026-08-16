import { fileURLToPath } from 'node:url';

import { REMOTE_LIST, defaultWebEntry } from '@mfa/remote-config';
import type { NextConfig } from 'next';

/**
 * 브라우저 MF 런타임이 읽을 remote 매니페스트 URL 들. **remote 별로 손댈 곳이 없다.**
 *
 * ## 왜 host 코드가 아니라 여기서 만드나
 *
 * `NEXT_PUBLIC_*` 은 `process.env.리터럴` 형태만 빌드 타임에 치환된다. 동적 접근은
 * 치환 대상이 아니라 브라우저에서 `undefined` 가 된다. 그래서 host **코드** 안에서는
 * remote 목록을 순회하며 env 를 읽을 수 없고, remote 수만큼 리터럴을 적어야 했다.
 *
 * `next.config.ts` 는 다르다. **node 에서 평가되므로** SSOT 를 순회해 값을 다 꺼낼 수 있고,
 * 결과를 아래 `env` 로 넘기면 Next 가 그걸 번들에 인라인한다. 그러면 host 코드는
 * 리터럴 **하나**(`process.env.MFA_REMOTE_WEB_ENTRIES`)만 읽으면 되고, remote 가 늘어도
 * 이 파일도 host 코드도 안 고친다 — `packages/remote-config` 만 고치면 된다.
 *
 * `env` 로 넣은 값은 `NEXT_PUBLIC_` 접두사 없이도 브라우저 번들에 들어간다.
 * 그 접두사는 환경/`.env` 파일로 들어온 변수에만 적용되는 규칙이다.
 * https://nextjs.org/docs/app/api-reference/config/next-config-js/env
 *
 * ⚠️ SSR 엔트리(`REMOTE_*_SSR_ENTRY`)는 여기 넣지 않는다. host **서버**만 쓰는 값이고,
 * 브라우저에 굳이 노출할 이유가 없다. 그쪽은 서버에서 `process.env[이름]` 으로 읽는다
 * (`src/mf/remote-endpoints.ts`).
 */
const REMOTE_WEB_ENTRIES = Object.fromEntries(
  REMOTE_LIST.map(({ name, env }) => [
    name,
    // `||` 인 이유: 빈 `ARG` 가 빈 문자열로 도착한다 (docs/03-setup/04-dokploy.md)
    process.env[env.webEntry] || defaultWebEntry(name),
  ]),
);

/**
 * host — Next.js 16 / Turbopack
 *
 * 중요: 여기에 Module Federation 번들러 플러그인은 없다.
 * @module-federation/nextjs-mf 는 webpack + Pages Router 전용이고 next 16 을 peer 로 받지 않는다.
 * 대신 host 는 브라우저에서 @module-federation/runtime 으로 remote 를 로드한다.
 * (자세한 근거: docs/01-research/01-nextjs-mf-eol.md)
 */
/**
 * Cache Components 를 켠다. Next 16 의 기본 방향이다.
 *
 * 16 부터 `dynamic` / `revalidate` / `fetchCache` 세그먼트 설정은 `use cache` +
 * `cacheLife` 로 **대체**됐다. 켠 상태에서 옛 설정을 남기면 컴파일 에러가 난다.
 *
 *   Error: Route segment config "revalidate" is not compatible with
 *          `nextConfig.cacheComponents`. Please remove it.
 *
 * 이행 매핑 (공식 가이드 기준):
 *   dynamic = "force-dynamic" → 삭제. 캐시하지 않으면 기본이 동적이다.
 *                                요청 시점 실행이 꼭 필요하면 `connection()` + `<Suspense>`.
 *   revalidate = N            → "use cache" + cacheLife(...)
 *   experimental_ppr          → 삭제. PPR 이 Cache Components 에 흡수됐다.
 *   dynamicParams             → 미지원. 삭제.
 *
 * 점진 이행이 필요하면 세그먼트에 `export const instant = false` 로 검증만 미룰 수 있다.
 *
 * https://nextjs.org/docs/app/guides/migrating-to-cache-components
 * 측정 결과: docs/04-experiments/03-cache-modes.md
 */
const nextConfig: NextConfig = {
  reactStrictMode: true,

  /** 위에서 SSOT 를 순회해 만든 값. 소비처는 `src/mf/remote-endpoints.ts` 하나다. */
  env: {
    MFA_REMOTE_WEB_ENTRIES: JSON.stringify(REMOTE_WEB_ENTRIES),
  },

  /**
   * 컨테이너 배포용 자립 산출물(.next/standalone).
   * 런타임 이미지에 pnpm 워크스페이스 전체를 넣지 않으려면 필요하다.
   */
  output: 'standalone',

  /**
   * 추적 루트를 저장소 루트로 올린다.
   * pnpm 은 node-linker=isolated 라 실제 파일이 `<repo>/node_modules/.pnpm` 에 있다.
   * 기본값(앱 디렉터리)이면 심링크 대상이 추적 범위 밖이라 standalone 이 깨진다.
   *
   * 부작용: standalone 산출물이 이 루트 구조를 미러링한다.
   *   .next/standalone/apps/host/server.js  ← 진입점 경로가 한 단계 깊어진다
   */
  outputFileTracingRoot: fileURLToPath(new URL('../../', import.meta.url)),

  /**
   * 파일 트레이싱이 `@swc/helpers` 의 `esm/` 를 통째로 빠뜨린다.
   * 빌드도 배포도 성공한 채로 컨테이너가 부팅에서 죽는다:
   *
   *   Cannot find module '.../@swc/helpers/esm/_interop_require_default.js'
   *     at resolveExports (node:internal/modules/cjs/loader)
   *
   * ## 왜 트레이서와 런타임이 어긋나나
   *
   * `@swc/helpers` 는 서브패스마다 조건부 exports 를 준다. 0.5.23 기준:
   *
   *   "./_/_interop_require_default": {
   *     "module-sync": "./esm/_interop_require_default.js",   ← Node 가 require(esm) 로 고르는 것
   *     "webpack":     "./esm/_interop_require_default.js",
   *     "import":      "./esm/_interop_require_default.js",
   *     "default":     "./cjs/_interop_require_default.cjs"   ← 트레이서가 고르는 것
   *   }
   *
   * Node 는 `require(esm)` 이 켜져 있으면 `module-sync` 를 적용해 **esm** 을 집는다.
   * Next 의 파일 트레이서는 그 조건을 안 써서 **cjs** 만 담는다. 그래서 담긴 적 없는
   * 파일을 런타임이 요구한다. 실측(같은 Node, 같은 리졸버):
   *
   *   @swc/helpers 0.5.23 (next 16) → esm/_interop_require_default.js
   *   @swc/helpers 0.5.5  (next 14) → cjs/_interop_require_default.cjs   ← module-sync 조건 자체가 없다
   *
   * 즉 next 14 시절 프로젝트에서 이 설정이 필요 없었던 건 우연이 아니라 exports 맵이
   * 달라서다. pnpm·모노레포·Turbopack·Node 버전과는 무관하다(전부 대조 확인).
   *
   * 런타임에서 `--no-experimental-require-module` 로 막아도 cjs 로 떨어지긴 하지만,
   * 실험 플래그에 기대는 대신 필요한 파일을 담는 쪽을 택한다.
   *
   * 값은 **프로젝트 루트(apps/host) 기준 glob** 이고, `outputFileTracingRoot` 안이면
   * `../` 로 밖을 가리켜도 된다. pnpm 이 isolated 링커라 실체가 `.pnpm` 아래에 있다.
   */
  outputFileTracingIncludes: {
    '/**/*': [
      '../../node_modules/.pnpm/@swc+helpers@*/node_modules/@swc/helpers/esm/**/*',
    ],
  },

  cacheComponents: true,

  // 워크스페이스 패키지는 dist(JS)로 빌드되지만, 소스맵/트리셰이킹을 위해 명시
  // (`@mfa/remote-config` 는 빌드 없이 소스를 그대로 export 하므로 여기 없어도 된다)
  transpilePackages: ['@mfa/ui', '@mfa/contracts'],
};

export default nextConfig;
