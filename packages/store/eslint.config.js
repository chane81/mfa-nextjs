import { reactConfig } from '@mfa/eslint-config/react';

export default [
  ...reactConfig,
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
     */
    files: ['src/server.ts'],
    rules: {
      'no-restricted-syntax': [
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
];
