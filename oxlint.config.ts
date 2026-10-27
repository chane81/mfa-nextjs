import { defineConfig } from 'oxlint';

/**
 * 저장소 전체의 린트 설정 — 이 파일 하나다. 영역별 차이는 `overrides` 로 적는다.
 * 규칙 선정 · 측정 · 기각한 대안은 ADR-028(`docs/02-architecture/01-decision.md`).
 */
export default defineConfig({
  // 지정하면 기본 플러그인 집합을 대체한다. react · nextjs 는 overrides 에서 켠다.
  plugins: ['eslint', 'typescript', 'unicorn', 'oxc'],
  jsPlugins: [
    // turbo.json 에 선언되지 않은 환경변수 사용을 잡는다.
    'eslint-plugin-turbo',
    // oxlint 가 구현하지 않은 `no-restricted-syntax` 용. `eslint` 는 예약어라 별칭을 쓴다.
    { name: 'eslint-js', specifier: 'oxlint-plugin-eslint' },
    // Tailwind 클래스를 디자인 시스템에 대고 검증한다. 규칙은 overrides 에서 켠다.
    'oxlint-tailwindcss',
  ],
  categories: {
    correctness: 'error',
  },
  settings: {
    // 모노레포라 Next 앱 위치를 알려준다 — `nextjs/no-html-link-for-pages` 가 쓴다.
    next: { rootDir: 'apps/host/' },
    // Tailwind 디자인 시스템의 원본. 앱이 자기 `@theme` · `@utility` 를 갖게 되면
    // `{ files, use }` 배열로 앱별 매핑을 돌려놓는다.
    tailwindcss: { entryPoint: 'packages/tailwind-config/theme.css' },
  },
  env: {
    builtin: true,
    browser: true,
    node: true,
  },
  // 빌드 산출물은 oxlint 가 `.gitignore` 를 읽어 이미 제외한다. gitignore 밖인 둘만 적는다.
  ignorePatterns: [
    // 생성물이지만 커밋한다(네트워크 없는 `pnpm typecheck`).
    '**/@mf-types/**',
    // Pages 로 공개하는 단독 브라우저 스크립트.
    'docs/**',
  ],
  rules: {
    // @eslint/js recommended 중 correctness 밖에 있던 것
    'no-case-declarations': 'error',
    'no-empty': 'error',
    'no-fallthrough': 'error',
    'no-prototype-builtins': 'error',
    'no-regex-spaces': 'error',
    'no-useless-assignment': 'error',
    'preserve-caught-error': 'error',

    // typescript-eslint recommended 중 correctness 밖에 있던 것
    'no-var': 'error',
    'prefer-const': 'error',
    'prefer-rest-params': 'error',
    'prefer-spread': 'error',
    'no-array-constructor': 'error',
    'typescript/ban-ts-comment': 'error',
    'typescript/no-empty-object-type': 'error',
    'typescript/no-explicit-any': 'error',
    'typescript/no-namespace': 'error',
    'typescript/no-require-imports': 'error',
    'typescript/no-unnecessary-type-constraint': 'error',
    'typescript/no-unsafe-function-type': 'error',

    // 저장소가 직접 정한 것
    'typescript/consistent-type-imports': [
      'error',
      { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
    ],
    'no-unused-vars': [
      'error',
      { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
    ],
    'turbo/no-undeclared-env-vars': 'warn',
  },
  overrides: [
    {
      // React 를 쓰는 곳. 훅 규칙은 oxlint 가 react 플러그인에 합쳐 두었다.
      files: ['apps/**', 'packages/ui/**', 'packages/store/**', 'tests/**'],
      plugins: ['react'],
      rules: {
        'react/display-name': 'error',
        'react/jsx-no-comment-textnodes': 'error',
        'react/jsx-no-target-blank': 'error',
        'react/no-unescaped-entities': 'error',
        'react/no-unknown-property': 'error',
        'react/require-render-return': 'error',
        'react/rules-of-hooks': 'error',
        'react/exhaustive-deps': 'warn',
        'react/incompatible-library': 'warn',
        'react/unsupported-syntax': 'warn',
        // React 19 + 자동 JSX 런타임에서는 불필요
        'react/react-in-jsx-scope': 'off',
      },
    },
    {
      // Tailwind 클래스를 쓰는 곳. oxlint-tailwindcss 의 recommended 그대로다 —
      // JS 플러그인 규칙은 `categories` 로 켜지지 않아 하나씩 적는다.
      files: ['apps/**', 'packages/ui/**'],
      rules: {
        'tailwindcss/no-conflicting-classes': 'error',
        'tailwindcss/no-contradicting-variants': 'warn',
        'tailwindcss/no-dark-without-light': 'warn',
        'tailwindcss/no-duplicate-classes': 'warn',
        'tailwindcss/no-dynamic-classes': 'error',
        'tailwindcss/no-unknown-classes': 'error',
        'tailwindcss/enforce-canonical': 'warn',
        'tailwindcss/enforce-negative-arbitrary-values': 'warn',
        'tailwindcss/no-deprecated-classes': 'error',
        'tailwindcss/no-unnecessary-arbitrary-value': 'warn',
        'tailwindcss/consistent-variant-order': 'warn',
        'tailwindcss/enforce-consistent-important-position': 'warn',
        'tailwindcss/enforce-consistent-variable-syntax': 'warn',
        'tailwindcss/enforce-shorthand': 'warn',
        'tailwindcss/enforce-sort-order': 'warn',
        'tailwindcss/no-unnecessary-whitespace': 'warn',
        'tailwindcss/no-hardcoded-colors': 'warn',
      },
    },
    {
      // Next.js 16 App Router. recommended + core-web-vitals.
      files: ['apps/host/**'],
      plugins: ['nextjs'],
      rules: {
        'nextjs/google-font-display': 'warn',
        'nextjs/google-font-preconnect': 'warn',
        'nextjs/next-script-for-ga': 'warn',
        'nextjs/no-async-client-component': 'warn',
        'nextjs/no-before-interactive-script-outside-document': 'warn',
        'nextjs/no-css-tags': 'warn',
        'nextjs/no-head-element': 'warn',
        'nextjs/no-img-element': 'warn',
        'nextjs/no-page-custom-font': 'warn',
        'nextjs/no-styled-jsx-in-document': 'warn',
        'nextjs/no-title-in-document-head': 'warn',
        'nextjs/no-typos': 'warn',
        'nextjs/no-unwanted-polyfillio': 'warn',
      },
    },
    {
      // remote 는 `@mfa/contracts` 배럴만 쓴다 — `/remote` 는 빌드 순환이 된다.
      // 근거: `.claude/rules/remotes.md`
      files: ['apps/remote-*/**'],
      rules: {
        'no-restricted-imports': [
          'error',
          {
            paths: [
              {
                name: '@mfa/contracts/remote',
                message:
                  'remote 는 @mfa/contracts 배럴만 쓴다. /remote 는 MF DTS 산출물을 읽어서 빌드 순환이 된다.',
              },
            ],
          },
        ],
      },
    },
    {
      // 서버(RSC) 표면에 `'use client'` 를 막는다. 근거: ADR-015 · known-issues E-5
      files: ['packages/store/src/server.ts'],
      rules: {
        'eslint-js/no-restricted-syntax': [
          'error',
          {
            selector:
              'Program > ExpressionStatement > Literal[value="use client"]',
            message:
              "서버(RSC) 표면이다. 'use client' 를 붙이면 모든 export 가 클라이언트 참조가 되어 서버에서 못 부른다.",
          },
        ],
      },
    },
    {
      // turbo 태스크 밖에서 도는 파일 — env 규칙의 전제가 없다.
      // 근거: `docs/02-architecture/07-turbo-tasks.md`
      files: ['vitest.config.ts', 'tests/**', '**/*.test.{ts,tsx}'],
      rules: {
        'turbo/no-undeclared-env-vars': 'off',
      },
    },
  ],
});
