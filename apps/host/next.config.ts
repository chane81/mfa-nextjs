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
// 빈 문자열도 "설정 안 됨"으로 본다 — 값 없는 빌드 인자가 ENV="" 로 들어오기 때문이다
const ZONE_CHECKOUT_URL = process.env.ZONE_CHECKOUT_URL || "http://localhost:3003";

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

  cacheComponents: true,

  // 워크스페이스 패키지는 dist(JS)로 빌드되지만, 소스맵/트리셰이킹을 위해 명시
  transpilePackages: ["@mfa/ui", "@mfa/contracts"],

  async rewrites() {
    /**
     * 실험 B(Multi-Zones)는 **비교용으로만** 남겨두었다.
     * zone 경계는 하드 내비게이션이 강제되어 SPA 설계가 무의미해지므로
     * 실제 결제 경로(/checkout)는 remote 로 옮겼다. (docs/02-architecture/03-ssr-and-soft-nav.md)
     */
    return [
      {
        source: "/legacy-checkout",
        destination: `${ZONE_CHECKOUT_URL}/legacy-checkout`,
      },
      {
        source: "/legacy-checkout/:path*",
        destination: `${ZONE_CHECKOUT_URL}/legacy-checkout/:path*`,
      },
      {
        // zone 의 정적 자산(assetPrefix)도 같은 도메인으로 프록시해야 한다
        source: "/legacy-checkout-static/:path*",
        destination: `${ZONE_CHECKOUT_URL}/legacy-checkout-static/:path*`,
      },
    ];
  },
};

export default nextConfig;
