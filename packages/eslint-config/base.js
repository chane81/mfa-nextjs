import js from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
import turbo from "eslint-plugin-turbo";
import prettier from "eslint-config-prettier";
import tseslint from "typescript-eslint";

/**
 * 모든 워크스페이스가 공유하는 기본 ESLint 설정.
 * ESLint 10 flat config 기준.
 */
export const baseConfig = defineConfig([
  globalIgnores([
    "**/node_modules/**",
    "**/dist/**",
    "**/.next/**",
    "**/.turbo/**",
    "**/@mf-types/**",
  ]),
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    plugins: { turbo },
    rules: {
      // turbo.json 에 선언되지 않은 환경변수 사용을 잡아냄
      "turbo/no-undeclared-env-vars": "warn",
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports", fixStyle: "inline-type-imports" },
      ],
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  prettier,
]);

export default baseConfig;
