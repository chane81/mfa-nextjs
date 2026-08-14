"use client";

import { useRouter } from "next/navigation";

import { RemoteComponent } from "@/mf/RemoteComponent";

/**
 * 결제 화면. Multi-Zone 이 아니라 **remote** 다.
 * 라우팅이 host 안에 남아 있으므로 진입/이탈 모두 소프트 내비게이션이다.
 */
export function CheckoutSection() {
  const router = useRouter();

  return (
    <RemoteComponent
      module="cart/CheckoutFlow"
      fallbackLabel="cart remote 에서 주문서 불러오는 중…"
      props={{
        onDone: () => router.push("/"),
        onContinueShopping: () => router.push("/"),
      }}
    />
  );
}
