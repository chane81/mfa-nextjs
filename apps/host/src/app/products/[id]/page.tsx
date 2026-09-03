import Link from 'next/link';
import { Suspense } from 'react';

import { Skeleton } from '@mfa/ui';

import { ProductDetailSection } from '@/components/ProductDetailSection';
import { RelatedProductsSection } from '@/components/RelatedProductsSection';

/**
 * cacheComponents 를 켜면 `params` 접근도 런타임 데이터로 취급된다.
 * Suspense 밖에서 await 하면 prerender 가 막히므로(blocking-prerender-dynamic)
 * params 를 읽는 부분만 별도 컴포넌트로 떼어 경계 안에 넣는다.
 */
async function ProductDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // 같은 remote 의 모듈 둘을 한 경계 안에서 쓴다. 둘 다 `id` 하나만 필요하므로
  // params 를 두 번 읽지 않는다.
  return (
    <div className="flex flex-col gap-6">
      <ProductDetailSection productId={id} />
      <RelatedProductsSection productId={id} />
    </div>
  );
}

export default function ProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <>
      <Link href="/" className="text-[13px] text-accent">
        ← 목록으로
      </Link>
      <Suspense fallback={<Skeleton label="상품 상세 준비 중…" />}>
        <ProductDetail params={params} />
      </Suspense>
    </>
  );
}
