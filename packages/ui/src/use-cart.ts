'use client';

// React 훅을 쓰므로 클라이언트 전용.
// Next.js Server Component 가 @mfa/ui 배럴을 가져가도 안전하도록 경계를 명시한다.

import { useSyncExternalStore } from 'react';

import {
  EMPTY_CART_SNAPSHOT,
  getCartStore,
  type CartSnapshot,
  type CartStore,
} from '@mfa/contracts';

/**
 * host / remote 어디서 호출하든 같은 globalThis 싱글턴 스토어를 구독한다.
 * 서버 스냅샷은 항상 비어 있는 값 → SSR hydration mismatch 방지.
 */
export function useCart(): CartSnapshot & { store: CartStore } {
  const store = getCartStore();
  const snapshot = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    () => EMPTY_CART_SNAPSHOT,
  );
  return { ...snapshot, store };
}
