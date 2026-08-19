'use client';

import { shallow } from 'zustand/shallow';
import { useStoreWithEqualityFn } from 'zustand/traditional';
import { type StoreApi } from 'zustand';

import { globalSingleton } from './global-singleton';

export type UseStore<T> = <U>(selector: (state: T) => U) => U;

/**
 * 도메인 스토어를 React 훅으로 만든다. 도메인마다 반복되던 두 단계 —
 * 전역 싱글턴 확보와 훅 배선 — 를 한 줄로 모은다.
 *
 *   export const useCart = createHook('cart', createCartStore); // UseStore<CartState>
 *
 * ## 왜 인스턴스가 아니라 팩토리를 받나
 *
 * 인스턴스를 받으면 호출부가 먼저 `globalSingleton` 을 불러야 하고, 빠뜨리면 번들마다
 * 스토어가 갈라진다 — 빌드도 타입체크도 통과하고 화면만 어긋난다. 팩토리를 받으면
 * 그 단계를 건너뛸 방법이 없다. `create` 는 레지스트리가 비었을 때만 불린다.
 *
 * ## 왜 `StoreApi<T>` 인가
 *
 * `UseBoundStoreWithEqualityFn` 은 `createWithEqualityFn` 이 만드는 **이미 훅인** 스토어의
 * 타입이다. 이 저장소의 스토어는 `zustand/vanilla` 의 `createStore` 산출물이라 `StoreApi<T>`
 * 이고, persist 가 붙어 `StoreApi<T> & { persist: … }` 가 되어도 대입된다.
 *
 * 비교 함수는 `shallow` 로 못 박는다 — "새 객체를 돌려주면 비교 함수를 챙겨라"는
 * zustand 규칙이 화면으로 새지 않게 하려는 것이다.
 */
export const createHook = <T>(
  storeName: string,
  create: () => StoreApi<T>,
): UseStore<T> => {
  const store = globalSingleton(storeName, create);

  return (selector) => useStoreWithEqualityFn(store, selector, shallow);
};
