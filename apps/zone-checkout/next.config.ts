import { fileURLToPath } from "node:url";

import type { NextConfig } from "next";

/**
 * zone-checkout — Multi-Zones 방식 마이크로 프론트엔드 (실험 B)
 *
 * Module Federation 과 달리 런타임 코드 공유가 전혀 없다.
 * host 가 /checkout/* 를 이 앱으로 rewrite 하고, 브라우저는 하드 내비게이션으로 진입한다.
 * 장점: Next.js 16 + Turbopack + App Router + RSC 를 100% 그대로 쓴다.
 * 단점: 경계를 넘을 때 페이지 전체 새로고침, 런타임 상태 공유 없음(localStorage 등으로 우회).
 */
const nextConfig: NextConfig = {
  reactStrictMode: true,

  // 컨테이너 배포용 자립 산출물. 근거는 host 의 next.config.ts 주석 참고.
  output: "standalone",
  outputFileTracingRoot: fileURLToPath(new URL("../../", import.meta.url)),

  // host 도메인에서 /legacy-checkout 하위로 서빙되므로 라우트 전체에 prefix 를 건다
  basePath: "/legacy-checkout",

  // 정적 자산은 /legacy-checkout-static 으로 분리 → host rewrite 규칙과 1:1 대응
  assetPrefix: "/legacy-checkout-static",

  transpilePackages: ["@mfa/ui", "@mfa/contracts"],
};

export default nextConfig;
