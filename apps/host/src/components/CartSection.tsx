'use client';

import { useRouter } from 'next/navigation';

import type { CartLine } from '@mfa/contracts';

import { RemoteComponent } from '@/mf/RemoteComponent';

export function CartSection({
  compact = false,
  initialLines,
}: {
  compact?: boolean;
  /** 서버가 요청 쿠키에서 읽어 넘긴 장바구니 */
  initialLines?: readonly CartLine[];
}) {
  const router = useRouter();

  return (
    <RemoteComponent
      module="cart/CartPanel"
      fallbackLabel="cart remote 에서 장바구니 불러오는 중…"
      props={{
        compact,
        initialLines,
        // /checkout 도 host 라우트(remote 렌더링)라서 소프트 내비게이션이다.
        onCheckout: () => router.push('/checkout'),
      }}
    />
  );
}
