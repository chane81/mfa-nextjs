import Link from 'next/link';
import { Suspense } from 'react';

import { tokens } from '@mfa/ui';
import { Skeleton } from '@mfa/ui';

import { ProductDetailSection } from '@/components/ProductDetailSection';

/**
 * cacheComponents 를 켜면 `params` 접근도 런타임 데이터로 취급된다.
 * Suspense 밖에서 await 하면 prerender 가 막히므로(blocking-prerender-dynamic)
 * params 를 읽는 부분만 별도 컴포넌트로 떼어 경계 안에 넣는다.
 */
async function ProductDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ProductDetailSection productId={id} />;
}

export default function ProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <>
      <Link href="/" style={{ color: tokens.color.accent, fontSize: 13 }}>
        ← 목록으로
      </Link>
      <Suspense fallback={<Skeleton label="상품 상세 준비 중…" />}>
        <ProductDetail params={params} />
      </Suspense>
    </>
  );
}
