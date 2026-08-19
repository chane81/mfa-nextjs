'use client';

import { createJSONStorage, persist } from 'zustand/middleware';
import { createStore, type StoreApi } from 'zustand';

import { type Product } from '@mfa/contracts';

import { createHook } from '../utils';

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
const createCartStore = (): CartStore =>
  createStore<CartState>()(
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

/**
 * 장바구니 훅. `createHook` 이 전역 싱글턴 확보까지 맡으므로 인스턴스는 어디에도
 * 노출되지 않는다 — 무엇을 구독할지는 호출부가 셀렉터로 정한다.
 */
export const useCart = createHook(STORE_NAME, createCartStore);
