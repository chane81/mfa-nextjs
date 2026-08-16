'use client';

import { useRouter } from 'next/navigation';

import type { Product } from '@mfa/contracts';

import { RemoteComponent } from '@/mf/RemoteComponent';

/**
 * 라우팅은 host 소유, 렌더링은 remote 소유.
 * remote 에 next/link 를 강요하지 않기 위해 콜백으로 경계를 나눈다.
 */
export function CatalogSection() {
  const router = useRouter();

  return (
    <RemoteComponent
      module="catalog/ProductGrid"
      fallbackLabel="catalog remote 에서 상품 목록 불러오는 중…"
      props={{
        category: 'all',
        onSelect: (product: Product) => router.push(`/products/${product.id}`),
      }}
    />
  );
}
