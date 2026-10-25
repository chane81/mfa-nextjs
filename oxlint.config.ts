import { defineConfig } from 'oxlint';

/**
 * 저장소 전체의 린트 설정. **이 파일 하나뿐이다** — 패키지별 설정 파일을 두지 않고
 * 영역별 차이는 아래 `overrides` 로 적는다. 루트 `pnpm lint` 가 저장소 전체를 한 번에 돈다.
 *
 * ESLint 10 + typescript-eslint 에서 옮겨왔다(ADR-028). 옮기며 지킨 원칙:
 *
 * - **ESLint 에서 켜져 있던 규칙은 그대로 켠다.** oxlint 기본값(`correctness` 카테고리)
 *   밖에 있던 것은 `rules` 에 하나씩 적었다.
 * - oxlint 에 없는 규칙 중 **이 저장소의 불변식을 지키는 것**(turbo env, store 의
 *   `'use client'` 차단)은 JS 플러그인으로 살렸다. JS 플러그인은 alpha 다.
 * - 나머지 빠진 규칙(`react/no-deprecated`, `react-hooks/config` · `gating`,
 *   `@next/next/no-location-assign-relative-destination`, `no-octal`)은 포기했다.
 *   ESM · TS 에서 의미 없거나 이 저장소에 해당 코드가 없다.
 */
export default defineConfig({
  // 지정하면 기본 플러그인 집합을 **대체**한다. react · nextjs 는 아래 overrides 에서 켠다.
  plugins: ['eslint', 'typescript', 'unicorn', 'oxc'],
  jsPlugins: [
    // turbo.json 에 선언되지 않은 환경변수 사용을 잡는다. 본체는 eslint-plugin-turbo.
    'eslint-plugin-turbo',
    // ESLint 코어 규칙 중 oxlint 가 아직 구현하지 않은 것(no-restricted-syntax).
    // `eslint` 이름은 oxlint 가 예약해서 별칭을 붙인다.
    { name: 'eslint-js', specifier: 'oxlint-plugin-eslint' },
  ],
  categories: {
    correctness: 'error',
  },
  // 모노레포라 Next 앱 위치를 알려줘야 `nextjs/no-html-link-for-pages` 가 pages 를 찾는다.
  settings: {
    next: { rootDir: 'apps/host/' },
  },
  env: {
    builtin: true,
    browser: true,
    node: true,
  },
  ignorePatterns: [
    '**/dist/**',
    '**/.next/**',
    '**/.turbo/**',
    '**/coverage/**',
    '**/@mf-types/**',
    // Pages 로 공개하는 시각화 페이지의 스크립트. ESLint 시절에도 린트 범위 밖이었다.
    'docs/**',
  ],
  rules: {
    // ── @eslint/js recommended 중 correctness 밖에 있던 것 ──
    'no-case-declarations': 'error',
    'no-empty': 'error',
    'no-fallthrough': 'error',
    'no-prototype-builtins': 'error',
    'no-regex-spaces': 'error',
    'no-useless-assignment': 'error',
    'preserve-caught-error': 'error',

    // ── typescript-eslint recommended 중 correctness 밖에 있던 것 ──
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

    // ── 저장소가 직접 정한 것 ──
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
      /**
       * React 를 쓰는 곳. ESLint 시절 `reactConfig` 를 쓰던 범위와 같다 —
       * contracts · utils · remote-config · scripts 는 React 규칙 없이 돈다.
       */
      files: ['apps/**', 'packages/ui/**', 'packages/store/**', 'tests/**'],
      plugins: ['react'],
      rules: {
        // eslint-plugin-react recommended 중 correctness 밖에 있던 것
        'react/display-name': 'error',
        'react/jsx-no-comment-textnodes': 'error',
        'react/jsx-no-target-blank': 'error',
        'react/no-unescaped-entities': 'error',
        'react/no-unknown-property': 'error',
        'react/require-render-return': 'error',
        // eslint-plugin-react-hooks recommended (oxlint 는 react 플러그인에 합쳐 두었다)
        'react/rules-of-hooks': 'error',
        'react/exhaustive-deps': 'warn',
        'react/incompatible-library': 'warn',
        'react/unsupported-syntax': 'warn',
        // React 19 + 자동 JSX 런타임에서는 불필요
        'react/react-in-jsx-scope': 'off',
      },
    },
    {
      // Next.js 16 App Router. recommended + core-web-vitals 중 ESLint 가 warn 이던 것은 warn 으로 둔다.
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
      /**
       * remote 는 `@mfa/contracts` 의 **배럴만** 쓴다.
       *
       * `@mfa/contracts/remote` 는 MF DTS 산출물(`src/generated/@mf-types`)을 읽는 진입점이다.
       * remote 가 그걸 import 하면 **자기 빌드 산출물에서 파생된 것을 빌드 입력으로 요구하는
       * 순환**이 된다 — 깨끗한 체크아웃에서 아무것도 빌드할 수 없다.
       *
       *     remote 빌드 → @mfa/contracts/remote → @mf-types → remote 빌드
       *
       * 어기면 결국 빌드가 죽지만 에러가 원인을 안 가리킨다(모듈 해석 실패로만 보인다).
       * 여기서 이름을 대고 막으면 편집기에서 바로 잡힌다. 근거: `.claude/rules/remotes.md`
       */
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
      /**
       * 서버(RSC) 표면에 `'use client'` 가 붙으면 **모든 export 가 클라이언트 참조가 된다.**
       * 서버 컴포넌트가 `parseCartCookie()` 를 부르는 순간 런타임에서 터진다:
       *
       *   Attempted to call parseCartCookie() from the server but parseCartCookie is on
       *   the client.
       *
       * 실제로 밟았다(known-issues E-5). 타입 · 빌드는 전부 통과하고 dev 콘솔에만 나타나서
       * 오래 안 보였다. 근거: ADR-015 가 "이 불변식을 지키는 건 주석뿐"이라고 적어둔 자리다.
       *
       * oxlint 는 `no-restricted-syntax` 를 구현하지 않아 ESLint 원본 규칙을 JS 플러그인으로 돌린다.
       */
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
      /**
       * turbo 태스크 밖에서만 도는 파일. `pnpm test` 는 turbo 를 거치지 않고 vitest 를
       * 직접 부른다(turbo.json 의 `//#typecheck:tests` 주석).
       *
       * `turbo/no-undeclared-env-vars` 는 "turbo 가 이 env 를 걸러낼 것"을 경고하는데,
       * 여기는 turbo 가 끼지 않으니 그 전제가 없다. 경고를 따라 `globalEnv` 에 넣으면
       * 그 값이 바뀔 때마다 **모든 태스크가 캐시를 놓친다** — `TZ` 때 이미 그렇게 판단해
       * 뺐다(turbo.json 의 `TZ` 주석). `CI`(vitest.config.ts 의 `slowTestThreshold`)도 같다.
       */
      files: ['vitest.config.ts', 'tests/**', '**/*.test.{ts,tsx}'],
      rules: {
        'turbo/no-undeclared-env-vars': 'off',
      },
    },
  ],
});
