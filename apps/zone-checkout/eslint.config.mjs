import { nextConfig } from "@mfa/eslint-config/next";

export default [
  ...nextConfig,
  {
    rules: {
      /**
       * Multi-Zones 에서 zone 경계를 넘는 링크는 반드시 <a> 여야 한다.
       * next/link 로 감싸면 클라이언트 라우터가 host 라우트로 처리하려다 404 가 난다.
       * 이 앱의 "/" 링크는 전부 host(3000) 로 나가는 링크이므로 룰을 끈다.
       */
      "@next/next/no-html-link-for-pages": "off",
    },
  },
];
