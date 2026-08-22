/**
 * `@mfa/store` 의 **서버(RSC) 표면.**
 *
 * `package.json` 의 `react-server` 조건이 RSC 그래프를 이 파일로 보낸다. 소비처는 그냥
 * `@mfa/store` 로 부르고, 어느 쪽 표면을 받을지는 번들러가 정한다.
 *
 * ## 규칙 하나 — `'use client'` 모듈을 재수출하지 않는다
 *
 * 도메인 배럴(`cart/index.ts`)에는 훅이 섞여 있으므로 **여기서는 도메인 배럴을 타지 않고
 * 순수 모듈을 직접 집는다.** 도메인이 늘면 이 파일에 줄이 는다 — `package.json` 이 아니라
 * 소스가 자라는 쪽이 맞다.
 *
 * ## 잘못 쓰면 빌드가 잡는다
 *
 * 타입은 `default` 조건(`index.d.ts`)으로 해석되므로 서버 코드에서 `useCart` 를 import 해도
 * `tsc` 는 통과한다. `next build` 가 잡는다:
 *
 *   Export useCart doesn't exist in target module
 *   The export useCart was not found in module .../dist/server.js [app-rsc]
 *
 * React 자신도 같은 방식이다(`react` 의 `exports` 에 `react-server` 분기가 있다).
 */
export * from './cart/cookie-codec';
