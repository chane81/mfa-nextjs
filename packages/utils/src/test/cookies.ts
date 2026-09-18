/**
 * jsdom 의 `document.cookie` 를 비운다.
 *
 * 장바구니는 쿠키에 산다(`@mfa/store` 의 `cartCookieStorage`). jsdom 은 테스트 파일 하나
 * 안에서 문서를 공유하므로, 앞 테스트가 담은 상품이 다음 테스트의 초기 상태가 된다 —
 * 실패가 **테스트 실행 순서에 따라** 나타났다 사라지는 형태라 가장 늦게 잡힌다.
 *
 * jsdom 에는 "전부 지우기" API 가 없다. 이름을 하나씩 읽어 `max-age=0` 으로 만료시키는
 * 게 유일한 방법이고, 그 일곱 벌짜리 복제가 각 테스트 파일에 있었다.
 *
 * ⚠️ `path` 가 `/` 인 쿠키만 지운다. `document.cookie` 는 이름과 값만 돌려주므로
 * 다른 경로에 심은 쿠키는 여기서 만료시킬 수 없다 — 지금 이 저장소가 그런 쿠키를
 * 쓰지 않기 때문에 성립하는 단순화다.
 */
export function clearCookies(): void {
  for (const part of document.cookie.split(/;\s*/)) {
    const name = part.split('=')[0];
    if (name) document.cookie = `${name}=; path=/; max-age=0`;
  }
}
