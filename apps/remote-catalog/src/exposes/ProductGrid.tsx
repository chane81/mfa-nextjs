import { useMemo, useState } from 'react';

import {
  PRODUCTS,
  PRODUCT_CATEGORIES,
  type ProductCategory,
  type ProductGridProps,
} from '@mfa/contracts';
import { Button, Panel } from '@mfa/ui';

import { ProductCard } from '../components/ProductCard';

/** host 에 노출되는 모듈: `catalog/ProductGrid` */
export default function ProductGrid({
  category = 'all',
  onSelect,
}: ProductGridProps) {
  const [active, setActive] = useState<ProductCategory | 'all'>(category);

  const products = useMemo(
    () =>
      active === 'all'
        ? PRODUCTS
        : PRODUCTS.filter((p) => p.category === active),
    [active],
  );

  return (
    <Panel
      origin="remote: catalog · vite"
      originHue={280}
      title="상품 목록"
      actions={
        <div className="flex flex-wrap gap-2">
          {(['all', ...PRODUCT_CATEGORIES] as const).map((c) => (
            <Button
              key={c}
              variant={c === active ? 'primary' : 'ghost'}
              onClick={() => setActive(c)}
            >
              {c}
            </Button>
          ))}
        </div>
      }
    >
      <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4">
        {products.map((product) => (
          <ProductCard key={product.id} product={product} onSelect={onSelect} />
        ))}
      </div>
    </Panel>
  );
}
