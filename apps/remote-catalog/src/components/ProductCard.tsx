import { formatKRW, type Product } from '@mfa/contracts';
import { MAX_CART_QUANTITY, useCart, useHydrated } from '@mfa/store';
import { Badge, Button } from '@mfa/ui';

import { ORIGIN_HUE } from '../origin';

import { StockBadge } from './StockBadge';

export interface ProductCardProps {
  product: Product;
  onSelect?: (product: Product) => void;
}

export function ProductCard({ product, onSelect }: ProductCardProps) {
  const add = useCart((state) => state.add);
  const soldOut = product.stock === 0;

  /**
   * 담긴 수량이 상한에 닿으면 더 담지 못하게 한다. 상한은 쿠키 코덱이 쥐고 있고
   * (`MAX_CART_QUANTITY`) 스토어는 안 자른다 — 그 비대칭은 의도된 것이라, 화면이
   * 그 위로 못 올라가게 막는 일이 담는 쪽 몫으로 남는다.
   *
   * `useHydrated` 로 한 번 거르는 이유: 스토어의 서버 스냅샷은 빈 장바구니라
   * 하이드레이션 렌더까지는 담긴 수량을 알 수 없다. 그 전에 판정하면 서버가 그린
   * 버튼과 첫 클라이언트 렌더가 갈린다.
   */
  const hydrated = useHydrated();
  const held = useCart(
    (state) =>
      state.lines.find((line) => line.productId === product.id)?.quantity ?? 0,
  );
  const atMax = hydrated && held >= MAX_CART_QUANTITY;

  return (
    <article className="flex flex-col gap-3 rounded-md border border-line bg-surface-alt p-4">
      <div className="text-[40px] leading-none">{product.emoji}</div>
      <div className="flex flex-col gap-1">
        <button
          type="button"
          onClick={() => onSelect?.(product)}
          className={`border-none bg-none p-0 text-left font-sans text-sm font-semibold text-text ${
            onSelect ? 'cursor-pointer' : 'cursor-default'
          }`}
        >
          {product.name}
        </button>
        <span className="text-xs leading-normal text-muted">
          {product.description}
        </span>
      </div>
      {/* Badge 는 줄바꿈하지 않는다(pill 이 무너진다). 넘칠 자리는 여기서 만든다 */}
      <div className="flex flex-wrap items-center gap-2">
        <Badge hue={ORIGIN_HUE}>{product.category}</Badge>
        <StockBadge stock={product.stock} />
        <Badge hue={45}>★ {product.rating.toFixed(1)}</Badge>
      </div>
      <div className="mt-auto flex items-center justify-between">
        <strong className="text-[15px] text-text">
          {formatKRW(product.price)}
        </strong>
        <Button
          variant="primary"
          disabled={soldOut || atMax}
          onClick={() => add(product)}
        >
          {atMax ? '가득' : '담기'}
        </Button>
      </div>
    </article>
  );
}
