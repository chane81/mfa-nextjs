/**
 * `@mfa/store` — host / remote 가 공유하는 런타임 상태.
 *
 * 도메인별 공개 표면(`src/<도메인>/index.ts`)을 여기서 한 번 더 모은다.
 * 소비처는 진입점 하나(`@mfa/store`)만 알면 되고, 도메인이 늘어도 그 사실은 안 바뀐다.
 * 내보내는 것은 **훅과 타입**이다 — 스토어 인스턴스는 각 도메인 안에 남는다.
 *
 * `hooks/` 는 도메인이 아니다 — 어느 도메인에도 묶이지 않는 훅이 거기 있다.
 *
 * **이 배럴은 브라우저용이다.** `'use client'` 모듈을 재수출하므로 RSC 가 여기를 타면
 * 클라이언트 그래프가 브라우저 번들로 딸려온다. 서버용 표면은 `server.ts` 고,
 * `package.json` 의 `react-server` 조건이 RSC 를 그쪽으로 보낸다 — 소비처는 양쪽 다
 * `@mfa/store` 로 부른다. 근거: ADR-015
 */
export * from './cart';
export * from './hooks';
