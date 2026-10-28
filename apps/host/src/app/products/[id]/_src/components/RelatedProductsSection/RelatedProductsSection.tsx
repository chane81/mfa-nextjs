'use client';

import { useRouter } from 'next/navigation';

import type { Product } from '@mfa/contracts';

import { RemoteComponent } from '@/mf/components/RemoteComponent';

/**
 * 상세 아래에 붙는 두 번째 catalog 모듈.
 *
 * `CatalogSection` 과 같은 규칙이다 — 라우팅은 host, 렌더링은 remote.
 * remote 에 `next/link` 를 강요하지 않으려고 이동을 콜백으로 넘긴다(ADR-013).
 *
 * 한 페이지에서 **같은 remote 의 모듈 둘**(`ProductDetail` · `RelatedProducts`)을
 * 쓰는 첫 자리다. MF 런타임은 remote 컨테이너를 한 번만 초기화하므로 두 번째 모듈은
 * 이미 받아 둔 번들에서 나온다.
 */
export function RelatedProductsSection({ productId }: { productId: string }) {
  const router = useRouter();

  return (
    <RemoteComponent
      module="catalog/RelatedProducts"
      fallbackLabel="catalog remote 에서 관련 상품 불러오는 중…"
      props={{
        productId,
        onSelect: (product: Product) => router.push(`/products/${product.id}`),
      }}
    />
  );
}
