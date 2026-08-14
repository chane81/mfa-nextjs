import type { NextConfig } from "next";

/**
 * host — Next.js 16 / Turbopack
 *
 * 중요: 여기에 Module Federation 번들러 플러그인은 없다.
 * @module-federation/nextjs-mf 는 webpack + Pages Router 전용이고 next 16 을 peer 로 받지 않는다.
 * 대신 host 는 브라우저에서 @module-federation/runtime 으로 remote 를 로드한다.
 * (자세한 근거: docs/01-research/01-nextjs-mf-eol.md)
 */
const ZONE_CHECKOUT_URL = process.env.ZONE_CHECKOUT_URL ?? "http://localhost:3003";

const nextConfig: NextConfig = {
  reactStrictMode: true,

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
