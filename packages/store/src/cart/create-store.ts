// `useCart` 가 여기 같이 있으므로 이 모듈은 클라이언트 전용이다.
// Next.js Server Component 가 `@mfa/store` 를 가져가도 경계에서 걸리도록 명시한다.
'use client';

import { createJSONStorage, persist } from 'zustand/middleware';
import { shallow } from 'zustand/shallow';
import { useStoreWithEqualityFn } from 'zustand/traditional';
import { createStore, type StoreApi } from 'zustand/vanilla';

import { type Product } from '@mfa/contracts';

import { globalSingleton } from '../utils/global-singleton';

export interface CartLine {
  readonly productId: string;
  readonly name: string;
  readonly emoji: string;
  readonly unitPrice: number;
  readonly quantity: number;
}

export interface CartState {
  readonly lines: readonly CartLine[];
  add(product: Product, quantity?: number): void;
  setQuantity(productId: string, quantity: number): void;
  remove(productId: string): void;
  clear(): void;
}

export type CartStore = StoreApi<CartState>;

/** 전역 레지스트리 안에서의 이름. 도메인 폴더 이름과 맞춘다 */
const STORE_NAME = 'cart';
const STORAGE_KEY = 'mfa-nextjs:cart';

/**
 * 격리된 인스턴스를 만든다. **직접 부르지 않는다** — 아래 `cartStore` 를 쓴다.
 * 테스트에서 상태를 격리하고 싶을 때만 쓸모가 있다.
 */
function createCartStore(): CartStore {
  return createStore<CartState>()(
    persist(
      (set) => ({
        lines: [],

        add(product, quantity = 1) {
          set((state) => {
            const held = state.lines.some(
              (line) => line.productId === product.id,
            );
            return {
              lines: held
                ? state.lines.map((line) =>
                    line.productId === product.id
                      ? { ...line, quantity: line.quantity + quantity }
                      : line,
                  )
                : [
                    ...state.lines,
                    {
                      productId: product.id,
                      name: product.name,
                      emoji: product.emoji,
                      unitPrice: product.price,
                      quantity,
                    },
                  ],
            };
          });
        },

        setQuantity(productId, quantity) {
          set((state) => ({
            lines:
              quantity <= 0
                ? state.lines.filter((line) => line.productId !== productId)
                : state.lines.map((line) =>
                    line.productId === productId ? { ...line, quantity } : line,
                  ),
          }));
        },

        remove(productId) {
          set((state) => ({
            lines: state.lines.filter((line) => line.productId !== productId),
          }));
        },

        clear() {
          set({ lines: [] });
        },
      }),
      {
        name: STORAGE_KEY,
        version: 1,
        /**
         * 서버에는 저장소가 없다. getter 가 던지면 `createJSONStorage` 가 `undefined` 를
         * 돌려주고 persist 는 복원·저장을 통째로 건너뛴다(zustand 5 규약).
         * 이 모듈은 remote 의 SSR 번들 안에서도 평가되므로 이 경로가 실제로 쓰인다.
         */
        storage: createJSONStorage(() => {
          if (typeof window === 'undefined') {
            throw new Error('서버에는 localStorage 가 없다');
          }
          return window.localStorage;
        }),
        /** 액션은 저장하지 않는다. 저장 대상은 lines 뿐 */
        partialize: (state) => ({ lines: state.lines }),
      },
    ),
  );
}

/** 이 앱이 쓰는 단 하나의 장바구니 스토어. 패키지 밖으로 내보내지 않는다 */
const cartStore: CartStore = globalSingleton(STORE_NAME, createCartStore);

/**
 * 스토어에 묶인 훅. **무엇을 구독할지는 호출부가 정한다.**
 *
 *   const lines = useCart((state) => state.lines);          // 목록만
 *   const add = useCart((state) => state.add);              // 액션 하나
 *   const { clear, setQuantity } = useCart((state) => ({    // 여럿을 한 번에
 *     clear: state.clear,
 *     setQuantity: state.setQuantity,
 *   }));
 *
 * 셀렉터를 미리 정의해 두지 않는다. 화면마다 필요한 조각이 다르고, 미리 정의하면
 * 쓰지도 않는 조합이 공개 API 로 굳는다.
 *
 * ## 비교는 여기서 끝낸다 — 호출부는 신경 쓰지 않는다
 *
 * zustand 5 의 기본 비교는 `Object.is` 라서, **새 객체를 돌려주는 셀렉터**를 그냥 넘기면
 * 매 렌더 다르다고 판정되어 무한 렌더로 간다. 그건 스토어 쪽 사정이지 화면의 관심사가
 * 아니므로 `shallow` 를 여기서 못 박는다. `shallow` 는 필드 단위 비교라 아래가 전부
 * 의도대로 동작한다.
 *
 *   state.lines     배열 — 길이와 원소 참조를 비교 (한 줄만 바뀌면 그 줄만 새 참조)
 *   state.add       함수 — 객체가 아니므로 `Object.is` 로 떨어진다
 *   { a, b } 묶음   필드 단위 비교
 *
 * ## SSR
 *
 * 서버 스냅샷은 `useStoreWithEqualityFn` 이 `getInitialState()` 로 가져간다
 * (zustand 5.0.x `src/traditional.ts` — `useSyncExternalStoreWithSelector` 3번째 인자).
 * 그 값은 스토어 생성 시점에 캐시된 초기 상태라 persist 복원값이 섞이지 않는다.
 * 서버 렌더와 hydration 렌더가 둘 다 빈 장바구니 → mismatch 가 없다.
 */
export function useCart<U = CartState>(selector: (state: CartState) => U): U {
  return useStoreWithEqualityFn(cartStore, selector, shallow);
}
