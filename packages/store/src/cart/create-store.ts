'use client';

import { createJSONStorage, persist } from 'zustand/middleware';
import { shallow } from 'zustand/shallow';
import {
  createWithEqualityFn,
  type UseBoundStoreWithEqualityFn,
} from 'zustand/traditional';
import { type StoreApi } from 'zustand/vanilla';

import { type Product } from '@mfa/contracts';

import { globalSingleton } from '../utils';

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

/**
 * 스토어이자 훅이다. `createWithEqualityFn` 의 반환값은 `StoreApi` 에
 * `<U>(selector, equalityFn?) => U` 호출 시그니처가 붙은 형태다.
 */
export type CartStore = UseBoundStoreWithEqualityFn<StoreApi<CartState>>;

/** 전역 레지스트리 안에서의 이름. 도메인 폴더 이름과 맞춘다 */
const STORE_NAME = 'cart';
const STORAGE_KEY = 'mfa-nextjs:cart';

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
