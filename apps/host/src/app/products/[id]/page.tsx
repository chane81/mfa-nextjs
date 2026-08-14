export const dynamic = "force-dynamic";

import Link from "next/link";

import { tokens } from "@mfa/ui";

import { ProductDetailSection } from "@/components/ProductDetailSection";

/** Next.js 16 에서 params 는 Promise 다 */
export default async function ProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <>
      <Link href="/" style={{ color: tokens.color.accent, fontSize: 13 }}>
        ← 목록으로
      </Link>
      <ProductDetailSection productId={id} />
    </>
  );
}
