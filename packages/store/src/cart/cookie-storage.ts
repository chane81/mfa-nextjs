import { type CartLine } from '@mfa/contracts';

import { createCookieStorage } from '../utils';

import {
  CART_COOKIE_MAX_AGE,
  CART_COOKIE_NAME,
  parseCartCookie,
  serializeCartCookie,
} from './cookie-codec';

/**
 * 장바구니 저장소 — **쿠키**다.
 *
 * ## 왜 localStorage 가 아닌가
 *
 * localStorage 는 브라우저에만 있다. 서버는 장바구니를 모른 채 HTML 을 만들었고,
 * 첫 화면이 항상 빈 장바구니였다가 복원된 값으로 바뀌었다. 실측으로 그 구간이 한 프레임,
 * 그 사이 헤더 배지 폭이 90px 자라고 패널 본문이 0 → 206px 로 튀었다 — 깜빡임이다.
 *
 * 색을 빼고 자리만 잡아봐도 소용이 없었다. 줄 수는 사용자마다 다르고 서버도 브라우저
 * 첫 렌더도 그 수를 모르니 **자리 크기 자체를 맞출 수 없다.**
 *
 * 쿠키는 요청에 실려 가므로 서버가 읽을 수 있다. 그래서 첫 HTML 부터 정확한 값이 들어가고
 * 전이가 아예 없어진다. 근거와 대가는 ADR-014.
 *
 * ## 여기 있는 건 **설정**뿐이다
 *
 * 쿠키 배관(읽기 · 쓰기 · 퍼센트 인코딩 · 속성 조립 · persist 봉투 · 쓰기 실패 감지)은
 * `utils/cookie-storage` 가 맡는다.
 * 도메인이 정하는 건 둘 — 쿠키에 무엇을 어떤 모양으로 담을지, 그리고 속성이다.
 *
 * ## 값의 모양은 `cookie-codec` 이 정한다
 *
 * 쿠키는 **요청마다 전송**된다. 상품명 · 가격 · 이모지까지 담으면 헤더가 무거워지고,
 * 카탈로그가 바뀌면 저장된 사본이 낡는다. 그래서 `[{id, q}]` 만 싣고 나머지는 읽을 때
 * 카탈로그에서 복원한다.
 *
 * 그 규칙을 여기 적지 않는 이유는 **서버도 같은 규칙을 봐야 하기 때문**이다. host 는
 * `parseCartCookie` 로 요청 쿠키를 읽어 `initialLines` 로 내려보낸다. 쓰는 쪽(여기)과
 * 읽는 쪽(host)이 각자 표현을 적으면 언젠가 갈라진다 — 그래서 원본은 이웃 파일
 * `cookie-codec` 하나고 양쪽 모두 그 함수 쌍을 부른다.
 */

/** persist 가 저장하는 조각. `partialize` 결과와 같아야 한다 */
interface PersistedCart {
  lines: readonly CartLine[];
}

/** 저장소 키. 쿠키 이름과 같은 값이다 */
export const CART_STORAGE_KEY = CART_COOKIE_NAME;

/**
 * 저장 표현이 바뀌면 `parseCartCookie` 가 옛 모양을 알아보고 변환한다.
 * persist 의 `version` · `migrate` 는 쓸 수 없다 — 쿠키에 버전이 없어서
 * 봉투에 실을 값이 항상 현재 버전이 되고, 그러면 비교가 영원히 일치한다.
 */
export const cartCookieStorage = createCookieStorage<PersistedCart>({
  /**
   * `secure` 는 넘기지 않는다 — 기본값이 현재 스킴을 따라간다. 배포(https)에서는 켜지고
   * dev(http://localhost)에서는 꺼진다. 여기서 `true` 로 박으면 dev 에서 쿠키가 저장조차
   * 안 되고, 그러면 이 실험 전체가 조용히 망가진다.
   */
  attributes: { maxAge: CART_COOKIE_MAX_AGE, sameSite: 'lax' },
  read: (raw) => ({ lines: parseCartCookie(raw) }),
  write: ({ lines }) => serializeCartCookie(lines),
});
