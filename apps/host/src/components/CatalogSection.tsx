'use client';

import { useRouter } from 'next/navigation';

import type { Product, ProductCategory } from '@mfa/contracts';

import { RemoteComponent } from '@/mf/components/RemoteComponent';

/**
 * 라우팅은 host 소유, 렌더링은 remote 소유.
 * remote 에 next/link 를 강요하지 않기 위해 콜백으로 경계를 나눈다.
 *
 * ## 카테고리는 받아서 넘기기만 한다
 *
 * 이 컴포넌트는 홈(`/`)과 실험 라우트 셋(`/lab/*`)이 같이 쓴다. 그래서 **여기서
 * `useSearchParams` 를 부르면 안 된다** — 프리렌더되는 `/lab/*` 이 `CLIENT_HOOK_DYNAMIC`
 * 으로 죽는다(실제로 빌드가 깨졌다). 필터를 주소에 남길지는 라우트마다 다른 정책이라
 * 그 결정은 `[[CatalogSlot]]` 이 쥐고, 여기는 값과 콜백만 받는다.
 */
export function CatalogSection({
  category = 'all',
  onCategoryChange,
}: {
  category?: ProductCategory | 'all';
  onCategoryChange?: (category: ProductCategory | 'all') => void;
}) {
  const router = useRouter();

  return (
    <RemoteComponent
      module="catalog/ProductGrid"
      fallbackLabel="catalog remote 에서 상품 목록 불러오는 중…"
      props={{
        category,
        onSelect: (product: Product) => router.push(`/products/${product.id}`),
        onCategoryChange,
      }}
    />
  );
}
