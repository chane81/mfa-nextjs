import { useMemo, useState } from 'react';

import {
  PRODUCTS,
  PRODUCT_CATEGORIES,
  type Product,
  type ProductCategory,
} from '@mfa/contracts';
import { Button, Panel } from '@mfa/ui';

import { ProductCard } from '../components/ProductCard';
import { ORIGIN } from '../origin';

/**
 * 이 모듈의 **공개 계약**. host 는 MF DTS 로 이 타입을 그대로 받아간다
 * (`@mf-types/catalog/ProductGrid`).
 *
 * ## 왜 여기 있나 — `@mfa/contracts` 가 아니라
 *
 * props 를 계약 패키지에 두면 host 와 remote 가 **같은 선언을 가리키게 되어**
 * DTS 가 전달할 정보가 없어진다. 실제로 그 상태에서는 계약을 바꿔도 remote 타입이
 * 따라 바뀌어 대조가 늘 통과했다(known-issues I-2).
 *
 * 선언이 구현 옆에 있으면 DTS 가 이걸 `compiled-types/` 에 인라인해 host 로 보낸다 —
 * 그제서야 "remote 가 실제로 무엇을 받는가"가 host 의 타입이 된다.
 *
 * 도메인 타입(`Product` · `ProductCategory`)은 여전히 `@mfa/contracts` 에서 온다.
 * 그건 host·remote·store 가 **같이 쓰는 어휘**지 이 모듈의 표면이 아니다.
 */
export interface ProductGridProps {
  /**
   * 보여줄 카테고리. **이 값이 바뀌면 내부 선택도 따라간다** —
   * host 가 URL 을 되돌렸을 때(뒤로 가기) 화면이 URL 과 갈라지지 않게 하려는 것이다.
   */
  category?: ProductCategory | 'all';
  /** host 가 라우팅을 소유하므로 상세 이동은 콜백으로 위임 */
  onSelect?: (product: Product) => void;
  /**
   * 사용자가 필터를 바꿨다는 통지. **remote 는 URL 을 모른다** — 그 선택을 주소에
   * 남길지 말지는 host 의 정책이라 여기서는 알리기만 한다(`onSelect` 와 같은 규칙).
   */
  onCategoryChange?: (category: ProductCategory | 'all') => void;
}

/** host 에 노출되는 모듈: `catalog/ProductGrid` */
export default function ProductGrid({
  category = 'all',
  onSelect,
  onCategoryChange,
}: ProductGridProps) {
  const [active, setActive] = useState<ProductCategory | 'all'>(category);

  /**
   * prop 이 바뀌면 선택을 맞춘다. `useEffect` 가 아니라 렌더 중에 고치는 이유는
   * 공식 문서가 권하는 형태이기 때문이다 — effect 로 하면 옛 값으로 한 번 그린 뒤
   * 다시 그린다(React `useState` 문서, "Adjusting state when a prop changes").
   *
   * 필요한 이유: 클릭은 host 를 거쳐 URL 로 갔다가 `category` 로 돌아온다. 뒤로 가기는
   * **URL 만** 되돌리므로, 여기서 안 맞추면 주소와 화면이 갈라진다.
   */
  const [syncedCategory, setSyncedCategory] = useState(category);
  if (category !== syncedCategory) {
    setSyncedCategory(category);
    setActive(category);
  }

  /** 선택은 내가 쥐고, 알리는 건 host 몫이다 */
  const select = (next: ProductCategory | 'all') => {
    setActive(next);
    onCategoryChange?.(next);
  };

  const products = useMemo(
    () =>
      active === 'all'
        ? PRODUCTS
        : PRODUCTS.filter((p) => p.category === active),
    [active],
  );

  return (
    <Panel
      {...ORIGIN}
      title="상품 목록"
      actions={
        <div className="flex flex-wrap gap-2">
          {(['all', ...PRODUCT_CATEGORIES] as const).map((c) => (
            <Button
              key={c}
              variant={c === active ? 'primary' : 'ghost'}
              onClick={() => select(c)}
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
