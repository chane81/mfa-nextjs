import { formatKRW, type Product } from '@mfa/contracts';
import { useCart } from '@mfa/store';
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
          disabled={soldOut}
          onClick={() => add(product)}
        >
          담기
        </Button>
      </div>
    </article>
  );
}
