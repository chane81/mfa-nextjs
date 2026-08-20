'use client';

import { useEffect, useRef } from 'react';

/**
 * 탭이 다시 앞으로 나올 때 콜백을 부른다. **브라우저 전용, 마운트 후에만 돈다.**
 *
 * ## 왜 필요한가
 *
 * 브라우저에만 있는 저장소(쿠키 · localStorage)를 쓰는 스토어는 **탭마다 사본을 쥔다.**
 * 탭 A 가 값을 바꿔 저장소에 적어도 탭 B 의 메모리 상태는 그대로고, 그 상태로 B 에서
 * 뭔가 바꾸면 B 의 낡은 전체 상태가 저장소를 덮어써 A 의 변경이 사라진다.
 *
 * 이걸 막는 표준 경로가 두 가지인데 둘 다 못 쓴다.
 *   - `storage` 이벤트는 **localStorage 전용**이다. 쿠키는 발화하지 않는다.
 *   - `cookieStore.onchange` 는 쿠키용이 맞지만 Chromium 계열에만 있다
 *     (Firefox · Safari 미구현). 이식성 있는 기본 경로로 삼을 수 없다.
 *
 * 남는 건 **포커스 복귀 시점에 직접 다시 읽기**다. 실시간은 아니지만 사용자가 그 탭을
 * 보기 시작하는 순간에는 맞는 값이 된다 — 화면에 틀린 값이 보이는 구간이 없다.
 *
 * ## 두 이벤트를 같이 듣는다
 *
 * `visibilitychange` 는 탭 전환을 잡고 `focus` 는 같은 탭 안에서 창을 다시 활성화하는
 * 경우(다른 앱에 갔다 오기)를 잡는다. 둘 다 걸어 두고 실제로 보이는 상태일 때만 실행한다.
 * 중복 발화는 호출부가 걸러야 한다 — 여기서는 "언제 부를지"만 정한다.
 *
 * ## 도메인에 묶이지 않는다
 *
 * 브라우저에만 있는 값을 화면에 쓰는 자리는 전부 같은 문제를 갖는다. 그래서
 * `cart/` 가 아니라 `hooks/` 에 둔다 — `[[use-hydrated]]` 와 같은 이유다.
 */
export function useRevalidateOnFocus(revalidate: () => void): void {
  /**
   * 콜백을 ref 로 받는다. 호출부가 인라인 함수를 넘겨도 매 렌더 구독을 다시 걸지 않게 —
   * effect 의존성에 콜백을 넣으면 정체성이 바뀔 때마다 리스너를 떼었다 붙인다.
   *
   * 갱신을 렌더 중이 아니라 effect 에서 한다(`react-hooks/refs`). 커밋 뒤에 반영되지만
   * 리스너는 사용자가 탭을 되돌아올 때 발화하므로 그 시점엔 이미 최신이다.
   */
  const latest = useRef(revalidate);
  useEffect(() => {
    latest.current = revalidate;
  }, [revalidate]);

  useEffect(() => {
    const run = () => {
      if (document.visibilityState !== 'visible') return;
      latest.current();
    };

    window.addEventListener('focus', run);
    document.addEventListener('visibilitychange', run);
    return () => {
      window.removeEventListener('focus', run);
      document.removeEventListener('visibilitychange', run);
    };
  }, []);
}
