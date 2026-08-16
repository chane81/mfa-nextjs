import { formatKRW, type Product } from './product.js';

/**
 * host 와 각 remote 는 서로 다른 번들에 들어간다.
 * 같은 모듈을 두 번 로드해도 장바구니 상태가 갈라지지 않도록
 * globalThis 에 싱글턴을 심는다. (MF shared 설정이 실패해도 동작하는 안전장치)
 */

export interface CartLine {
  readonly productId: string;
  readonly name: string;
  readonly emoji: string;
  readonly unitPrice: number;
  readonly quantity: number;
}

export interface CartSnapshot {
  readonly lines: readonly CartLine[];
  readonly totalQuantity: number;
  readonly totalPrice: number;
  readonly totalPriceLabel: string;
}

export interface CartStore {
  getSnapshot(): CartSnapshot;
  subscribe(listener: () => void): () => void;
  add(product: Product, quantity?: number): void;
  setQuantity(productId: string, quantity: number): void;
  remove(productId: string): void;
  clear(): void;
}

const STORE_KEY = '__MFA_CART_STORE__' as const;
const STORAGE_KEY = 'mfa-nextjs:cart';

type GlobalWithStore = typeof globalThis & {
  [STORE_KEY]?: CartStore;
};

function buildSnapshot(lines: readonly CartLine[]): CartSnapshot {
  const totalQuantity = lines.reduce((sum, line) => sum + line.quantity, 0);
  const totalPrice = lines.reduce(
    (sum, line) => sum + line.unitPrice * line.quantity,
    0,
  );
  return {
    lines,
    totalQuantity,
    totalPrice,
    totalPriceLabel: formatKRW(totalPrice),
  };
}

function readPersisted(): readonly CartLine[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as CartLine[]) : [];
  } catch {
    return [];
  }
}

function persist(lines: readonly CartLine[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(lines));
  } catch {
    // 시크릿 모드 등에서 실패해도 메모리 상태는 유지한다
  }
}

function createCartStore(): CartStore {
  let snapshot = buildSnapshot(readPersisted());
  const listeners = new Set<() => void>();

  const commit = (lines: readonly CartLine[]): void => {
    snapshot = buildSnapshot(lines);
    persist(lines);
    for (const listener of listeners) listener();
  };

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    add(product, quantity = 1) {
      const existing = snapshot.lines.find(
        (line) => line.productId === product.id,
      );
      const next = existing
        ? snapshot.lines.map((line) =>
            line.productId === product.id
              ? { ...line, quantity: line.quantity + quantity }
              : line,
          )
        : [
            ...snapshot.lines,
            {
              productId: product.id,
              name: product.name,
              emoji: product.emoji,
              unitPrice: product.price,
              quantity,
            },
          ];
      commit(next);
    },
    setQuantity(productId, quantity) {
      if (quantity <= 0) {
        commit(snapshot.lines.filter((line) => line.productId !== productId));
        return;
      }
      commit(
        snapshot.lines.map((line) =>
          line.productId === productId ? { ...line, quantity } : line,
        ),
      );
    },
    remove(productId) {
      commit(snapshot.lines.filter((line) => line.productId !== productId));
    },
    clear() {
      commit([]);
    },
  };
}

export function getCartStore(): CartStore {
  const scope = globalThis as GlobalWithStore;
  scope[STORE_KEY] ??= createCartStore();
  return scope[STORE_KEY];
}

/** SSR 렌더 시 사용할 빈 스냅샷 (hydration mismatch 방지용) */
export const EMPTY_CART_SNAPSHOT: CartSnapshot = buildSnapshot([]);
