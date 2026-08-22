'use client';

import { createJSONStorage, persist } from 'zustand/middleware';
import { shallow } from 'zustand/shallow';
import {
  createWithEqualityFn,
  type UseBoundStoreWithEqualityFn,
} from 'zustand/traditional';
import { type StoreApi } from 'zustand/vanilla';

import { type CartLine, type Product } from '@mfa/contracts';

import { globalSingleton } from '../utils';

import { cartCookieStorage, CART_STORAGE_KEY } from './cookie-storage';

/**
 * 줄의 모양은 `@mfa/contracts` 가 정한다 — 쿠키 포맷과 remote props(`initialLines`)에
 * 같이 나타나는 타입이라, 계약 쪽에 있어야 한 곳만 고치면 된다. 소비처 편의를 위해
 * 여기서 다시 내보낸다(`@mfa/store` 하나만 알면 되게).
 */
export type { CartLine };

export interface CartState {
  readonly lines: readonly CartLine[];
  add(product: Product, quantity?: number): void;
  setQuantity(productId: string, quantity: number): void;
  remove(productId: string): void;
  clear(): void;
}

/**
 * 스토어이자 훅이다. `createWithEqualityFn` 의 반환값은 `StoreApi` 에
 * `<U>(selector, equalityFn?) => U` 호출 시그니처가 붙은 형태다.
 *
 * `persist` 표면을 손으로 적는 이유: zustand 5.0.15 는 그 타입(`StorePersist`)을
 * **공개하지 않는다**(`middleware.d.ts` 의 export 목록에 없다). 미들웨어가 실제로 붙이는
 * 것 중 이 패키지가 쓰는 것만 좁혀 적는다 — `use-cart-sync` 가 `rehydrate()` 를 쓴다.
 */
export type CartStore = UseBoundStoreWithEqualityFn<StoreApi<CartState>> & {
  readonly persist: {
    rehydrate(): Promise<void> | void;
    hasHydrated(): boolean;
  };
};

/** 전역 레지스트리 안에서의 이름. 도메인 폴더 이름과 맞춘다 */
const STORE_NAME = 'cart';

/**
 * 격리된 인스턴스를 만든다. **직접 부르지 않는다** — 아래 `useCart` 를 쓴다.
 * 테스트에서 상태를 격리하고 싶을 때만 쓸모가 있다.
 *
 * `createWithEqualityFn`(`zustand/traditional`)을 쓰는 이유는 **기본 비교 함수**다.
 * `create` 는 비교가 `Object.is` 로 고정이라, 새 객체를 돌려주는 셀렉터
 * (`(state) => ({ clear, setQuantity })`)가 매 렌더 다르다고 판정되어 무한 렌더로 간다.
 * 여기서 `shallow` 를 기본값으로 박으면 그 규칙이 화면으로 새지 않는다.
 */
const createCartStore = (): CartStore =>
  createWithEqualityFn<CartState>()(
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
        name: CART_STORAGE_KEY,
        /**
         * `version` · `migrate` 를 두지 않는다. 쿠키 저장소는 봉투에 버전을 싣지 않고
         * (근거는 `utils/cookie-storage` 주석), 저장 표현이 바뀌면 `parseCartCookie` 가
         * 옛 모양을 알아본다. 여기 숫자를 적으면 동작하지 않는 장치가 배선된 것처럼 보인다.
         */
        /**
         * 저장소는 **쿠키**다. 서버가 읽을 수 있어야 첫 HTML 부터 값이 맞기 때문이고,
         * 근거는 `cookie-storage.ts` 주석과 ADR-014 에 있다.
         *
         * 서버에는 `document` 가 없다. getter 가 던지면 `createJSONStorage` 가
         * `undefined` 를 돌려주고 persist 는 복원·저장을 통째로 건너뛴다(zustand 5 규약).
         * 이 모듈은 remote 의 SSR 번들 안에서도 평가되므로 이 경로가 실제로 쓰인다.
         * 서버가 아는 장바구니는 스토어가 아니라 `initialLines` props 로 내려간다.
         */
        storage: createJSONStorage(() => {
          if (typeof document === 'undefined') {
            throw new Error('서버에는 document 가 없다');
          }
          return cartCookieStorage;
        }),
        /** 액션은 저장하지 않는다. 저장 대상은 lines 뿐 */
        partialize: (state) => ({ lines: state.lines }),
      },
    ),
    shallow,
  );

/**
 * 장바구니 훅. 무엇을 구독할지는 호출부가 셀렉터로 정한다.
 *
 *   const lines = useCart((state) => state.lines);
 *   const { clear, setQuantity } = useCart((state) => ({ ... }));  // shallow 가 기본값
 *
 * `globalSingleton` 을 거치는 이유는 번들 경계다 — host·catalog·cart 는 이 모듈의 사본을
 * 각자 가지므로, 인스턴스를 전역 레지스트리에 한 번만 심어야 장바구니가 하나로 유지된다.
 */
export const useCart = globalSingleton(STORE_NAME, createCartStore);
