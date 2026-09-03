import { useMemo } from 'react';

import { PRODUCTS, findProduct, type Product } from '@mfa/contracts';
import { Panel } from '@mfa/ui';

import { ProductCard } from '../components/ProductCard';
import { ORIGIN } from '../origin';

/**
 * 이 모듈의 **공개 계약**. 여기 두는 이유는 `ProductGrid.tsx` 의 같은 주석 —
 * props 를 `@mfa/contracts` 로 올리면 host 와 remote 가 같은 선언을 가리켜
 * DTS 가 전달할 정보가 없어진다(known-issues I-2).
 */
export interface RelatedProductsProps {
  /** 기준 상품. **이 상품 자신은 목록에서 빠진다.** */
  productId: string;
  /** 최대 개수. 기본 3 */
  limit?: number;
  /** host 가 라우팅을 소유하므로 상세 이동은 콜백으로 위임 (ADR-013) */
  onSelect?: (product: Product) => void;
}

/**
 * 같은 카테고리를 먼저 채우고 모자라면 나머지로 메운다.
 *
 * "관련" 의 기준을 카테고리 하나로 두는 건 이 저장소가 목 데이터를 쓰기 때문이다.
 * 추천 로직 자체는 이 실험의 관심사가 아니고, **remote 가 자기 도메인 판단을
 * 소유한다**는 것만 보이면 된다 — host 는 `productId` 만 넘긴다.
 *
 * 기준 상품을 못 찾아도 빈 화면을 만들지 않는다. host 가 잘못된 id 를 넘긴 경우는
 * `ProductDetail` 이 이미 오류로 알리므로, 여기까지 같은 말을 두 번 할 이유가 없다.
 */
function pickRelated(productId: string, limit: number): readonly Product[] {
  const others = PRODUCTS.filter((product) => product.id !== productId);
  const base = findProduct(productId);
  if (!base) return others.slice(0, limit);

  return [
    ...others.filter((product) => product.category === base.category),
    ...others.filter((product) => product.category !== base.category),
  ].slice(0, limit);
}

/** host 에 노출되는 모듈: `catalog/RelatedProducts` */
export default function RelatedProducts({
  productId,
  limit = 3,
  onSelect,
}: RelatedProductsProps) {
  const related = useMemo(
    () => pickRelated(productId, limit),
    [productId, limit],
  );

  if (related.length === 0) return null;

  return (
    <Panel {...ORIGIN} title="이 상품과 함께 보는 상품">
      <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4">
        {related.map((product) => (
          <ProductCard key={product.id} product={product} onSelect={onSelect} />
        ))}
      </div>
    </Panel>
  );
}
