'use client';

import { useSyncExternalStore } from 'react';

/**
 * "React 가 이 트리를 하이드레이트했는가"를 알려준다. **서버·첫 렌더 `false`, 커밋 후 `true`.**
 *
 * ## 왜 필요한가
 *
 * 쿠키로 옮겨 서버가 장바구니를 알게 됐어도 **한 자리가 남는다.** zustand 의 `useStore` 는
 * 하이드레이션 렌더에서 서버 스냅샷(`getInitialState()` = 빈 장바구니)을 쓴다 —
 * 서버 HTML 과 첫 클라이언트 렌더가 달라지면 안 되기 때문이다.
 *
 * 그래서 하이드레이션 렌더까지는 **서버가 넘겨준 `initialLines`** 를 쓰고, 커밋 후부터
 * 스토어를 쓴다. 두 값은 같은 쿠키에서 나오므로 **화면은 바뀌지 않는다**(단일 탭 기준 —
 * 응답 전송과 하이드레이션 사이에 다른 탭이 쿠키를 바꾸면 그 한 번은 갈린다) — 이게
 * localStorage 시절과 결정적으로 다른 점이다. 그때는 서버가 값을 몰라서 두 값이 달랐다.
 *
 * 도메인에 묶이지 않는다 — 브라우저에만 있는 값을 화면에 쓰는 자리는 전부 같은 경계를
 * 갖는다. 그래서 `cart/` 가 아니라 `hooks/` 에 둔다.
 */

/** 이 값은 하이드레이션 커밋 때 한 번 바뀌고 다시 안 바뀐다 — 구독할 대상이 없다 */
const unsubscribe = () => undefined;
const subscribe = () => unsubscribe;

const getSnapshot = () => true;
const getServerSnapshot = () => false;

export function useHydrated(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
