import { reactConfig } from '@mfa/eslint-config/react';

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
export default [
  ...reactConfig,
  {
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
];
