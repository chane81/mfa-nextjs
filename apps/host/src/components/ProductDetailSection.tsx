'use client';

import { RemoteComponent } from '@/mf/components/RemoteComponent';

export function ProductDetailSection({ productId }: { productId: string }) {
  return (
    <RemoteComponent
      module="catalog/ProductDetail"
      fallbackLabel="catalog remote 에서 상세 불러오는 중…"
      props={{ productId }}
    />
  );
}
