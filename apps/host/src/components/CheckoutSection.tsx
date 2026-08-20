'use client';

import { useRouter } from 'next/navigation';

import type { CartLine } from '@mfa/contracts';

import { RemoteComponent } from '@/mf/RemoteComponent';

/**
 * 결제 화면. Multi-Zone 이 아니라 **remote** 다.
 * 라우팅이 host 안에 남아 있으므로 진입/이탈 모두 소프트 내비게이션이다.
 */
export function CheckoutSection({
  initialLines,
}: {
  /** 서버가 요청 쿠키에서 읽어 넘긴 장바구니 */
  initialLines?: readonly CartLine[];
}) {
  const router = useRouter();

  return (
    <RemoteComponent
      module="cart/CheckoutFlow"
      fallbackLabel="cart remote 에서 주문서 불러오는 중…"
      props={{
        initialLines,
        onDone: () => router.push('/'),
        onContinueShopping: () => router.push('/'),
      }}
    />
  );
}
