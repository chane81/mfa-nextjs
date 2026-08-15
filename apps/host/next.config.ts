import { fileURLToPath } from "node:url";

import type { NextConfig } from "next";

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

  /**
   * 컨테이너 배포용 자립 산출물(.next/standalone).
   * 런타임 이미지에 pnpm 워크스페이스 전체를 넣지 않으려면 필요하다.
   */
  output: "standalone",

  /**
   * 추적 루트를 저장소 루트로 올린다.
   * pnpm 은 node-linker=isolated 라 실제 파일이 `<repo>/node_modules/.pnpm` 에 있다.
   * 기본값(앱 디렉터리)이면 심링크 대상이 추적 범위 밖이라 standalone 이 깨진다.
   *
   * 부작용: standalone 산출물이 이 루트 구조를 미러링한다.
   *   .next/standalone/apps/host/server.js  ← 진입점 경로가 한 단계 깊어진다
   */
  outputFileTracingRoot: fileURLToPath(new URL("../../", import.meta.url)),

  /**
   * 파일 트레이싱이 `@swc/helpers` 의 `esm/` 를 통째로 빠뜨린다.
   *
   * 이 패키지는 `cjs/` 와 `esm/` 를 둘 다 들고 있는데, 트레이서는 CJS 조건만 따라가
   * `cjs/` 와 `package.json` 만 담는다. 그런데 런타임 청크가 `esm/` 쪽을 직접 부른다.
   * 빌드도 배포도 성공한 채로 컨테이너가 부팅에서 죽는다:
   *
   *   Cannot find module '.../@swc/helpers/esm/_interop_require_default.js'
   *
   * 값은 **프로젝트 루트(apps/host) 기준 glob** 이고, `outputFileTracingRoot` 안이면
   * `../` 로 밖을 가리켜도 된다. pnpm 이 isolated 링커라 실체가 `.pnpm` 아래에 있다.
   */
  outputFileTracingIncludes: {
    "/**/*": ["../../node_modules/.pnpm/@swc+helpers@*/node_modules/@swc/helpers/esm/**/*"],
  },

  cacheComponents: true,

  // 워크스페이스 패키지는 dist(JS)로 빌드되지만, 소스맵/트리셰이킹을 위해 명시
  transpilePackages: ["@mfa/ui", "@mfa/contracts"],
};

export default nextConfig;
