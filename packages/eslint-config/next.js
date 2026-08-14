import { defineConfig } from "eslint/config";
import globals from "globals";
import next from "@next/eslint-plugin-next";

import { reactConfig } from "./react.js";

/** Next.js 16 App Router 앱(host, zone) 용 설정 */
export const nextConfig = defineConfig([
  ...reactConfig,
  {
    files: ["**/*.{ts,tsx,js,jsx}"],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: { "@next/next": next },
    rules: {
      ...next.configs.recommended.rules,
      ...next.configs["core-web-vitals"].rules,
    },
  },
]);

export default nextConfig;
