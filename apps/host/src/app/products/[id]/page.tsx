import Link from 'next/link';
import { Suspense } from 'react';

import { Skeleton } from '@mfa/ui';

import { ProductDetail } from './_src/components/ProductDetail';

/**
 * 셸만 그린다 — `params` 를 읽는 일은 `[[ProductDetail]]` 이 `Suspense` 안쪽에서 한다.
 * 그 경계가 왜 필요한지는 그쪽 주석에 있다(`blocking-prerender-dynamic`).
 */
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
