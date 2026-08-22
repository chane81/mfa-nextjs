import { cookies } from 'next/headers';

import { type CartLine } from '@mfa/contracts';
import { CART_COOKIE_NAME, parseCartCookie } from '@mfa/store';

/**
 * 요청에 실려 온 장바구니를 읽는다.
 *
 * ## 이게 host 가 장바구니를 "아는" 유일한 지점이다
 *
 * host 는 여전히 장바구니의 의미를 모른다 — 줄 목록을 읽어 remote 에 그대로 넘길 뿐이고,
 * 담기·수량·합계는 전부 cart remote 와 `@mfa/store` 가 쥔다. 포맷도 host 가 정하지 않는다
 * (`@mfa/store` 의 `cart/cookie-codec`). 여기서 하는 일은 **전달**이다.
 *
 * 이 파일이 host 에서 유일하게 `@mfa/store` 를 부르는 자리다. **서버 컴포넌트라
 * `react-server` 조건이 걸려 순수 표면(`dist/server.js`)으로 해석된다** — zustand 는
 * 그래프에 들어오지도 않는다. 조건이 없으면 브라우저 번들에 21.8KB 가 실린다(실측,
 * 대조군까지 확인). 근거: ADR-015
 *
 * ## 부르는 자리가 캐시를 결정한다
 *
 * `cacheComponents` 에서 `cookies()` 를 `<Suspense>` **밖**에서 부르면 그 라우트는
 * 프리렌더되지 않고 요청마다 렌더된다(Next 16 문서에 명시된 동작이다).
 *
 * | 부르는 자리                 | 셸 프리렌더 | 첫 페인트에 장바구니 |
 * | --------------------------- | ----------- | -------------------- |
 * | 페이지 본문 (Suspense 밖)   | ❌          | ⭕                   |
 * | `<Suspense>` 안 (헤더 슬롯) | ⭕          | 헤더 도착 시점       |
 *
 * 장바구니가 본문인 라우트(`/`·`/cart`·`/checkout`)는 첫 줄을 고른다 — 값이 첫 HTML 에
 * 들어가야 전이가 없어지고, 그게 이 변경의 목적이다. 레이아웃(헤더)은 두 번째 줄이다.
 * 레이아웃에서 Suspense 밖으로 읽으면 **모든 라우트**가 프리렌더에서 빠져 캐시 실험
 * (`/lab`)까지 같이 죽는다. 헤더는 `usePathname` 때문에 원래도 그 경계 뒤로
 * 스트리밍되므로 새로 생기는 지연이 없다. 근거: ADR-014
 */
export async function readCartLines(): Promise<readonly CartLine[]> {
  const store = await cookies();
  /**
   * `.value` 는 **이미 퍼센트 디코딩된** 값이다 — Next 의 쿠키 파서가
   * `decodeURIComponent` 를 부른다(`@edge-runtime/cookies`). `parseCartCookie` 는
   * 디코딩된 문자열을 받는 계약이라 그대로 넘긴다. 여기서 한 번 더 벗기면 브라우저
   * 경로와 층이 어긋난다 — 근거는 `parseCartCookie` 주석.
   */
  return parseCartCookie(store.get(CART_COOKIE_NAME)?.value);
}
