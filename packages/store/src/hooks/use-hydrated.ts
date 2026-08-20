'use client';

import { useSyncExternalStore } from 'react';

/**
 * "React 가 이 트리를 하이드레이트했는가"를 알려준다. **서버·첫 렌더 `false`, 커밋 후 `true`.**
 *
 * 도메인에 묶이지 않는다 — 장바구니든 뭐든 "브라우저에만 있는 값"을 화면에 쓰는 자리는
 * 전부 같은 경계를 갖는다. 그래서 `cart/` 가 아니라 `hooks/` 에 둔다.
 *
 * ## 왜 필요한가
 *
 * persist 는 동기 저장소(`localStorage`)를 쓰면 **스토어 생성 시점에 복원을 끝낸다**
 * (zustand 5.0.15 문서: "With synchronous hydration, the Zustand store will already have
 * been hydrated at its creation"). 즉 값이 늦게 오는 게 아니다.
 *
 * 늦는 건 React 다. `useStore` 는 내부적으로 `useSyncExternalStore` 를 쓰고, 하이드레이션
 * 렌더에서는 **서버 스냅샷**(`getInitialState()` = 초기 상태)을 쓴다. 서버 HTML 과 첫
 * 클라이언트 렌더가 달라지면 안 되기 때문이다. 그래서 "이미 아는 값을 일부러 안 쓰는"
 * 구간이 한 번 생기고, 하이드레이션 커밋에서 초기값 → 실제 값으로 한 번에 바뀐다
 * (실측 35~60ms).
 *
 * 이 훅은 그 커밋 경계를 그대로 노출한다. 값이 바뀌는 **바로 그 순간**을 알 수 있으니,
 * 호출부는 그 순간에 전환 애니메이션을 걸어 깜빡임을 의도된 움직임으로 바꾼다(ADR-014).
 *
 * ## 왜 `persist.hasHydrated()` 가 아닌가
 *
 * 그건 저장소 복원 여부고, 여기서 알아야 하는 건 **React 커밋 여부**다. 동기 저장소에서
 * `hasHydrated()` 는 첫 렌더 전부터 이미 `true` 라 경계를 못 만든다. 스토어와 무관하게
 * 쓸 수 있는 것도 이 구현뿐이다 — 이 훅은 zustand 를 아예 참조하지 않는다.
 */

/** 이 값은 하이드레이션 커밋 때 한 번 바뀌고 다시 안 바뀐다 — 구독할 대상이 없다 */
const unsubscribe = () => undefined;
const subscribe = () => unsubscribe;

const getSnapshot = () => true;
const getServerSnapshot = () => false;

export function useHydrated(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
