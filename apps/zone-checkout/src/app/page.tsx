import { tokens } from "@mfa/ui";

import { CheckoutForm } from "@/components/CheckoutForm";

export default function CheckoutPage() {
  return (
    <>
      <section
        style={{
          border: `1px dashed hsl(30 80% 65% / 0.5)`,
          borderRadius: tokens.radius.lg,
          padding: tokens.space(6),
          background: tokens.color.surface,
        }}
      >
        <h1 style={{ margin: 0, fontSize: 20 }}>결제 (Multi-Zone 비교용)</h1>
        <p style={{ color: tokens.color.textMuted, fontSize: 14, lineHeight: 1.7 }}>
          이 페이지는 host(3000)가 아니라 <strong>zone-checkout(3003)</strong> 이 렌더링했다.
          주소창은 <code>/legacy-checkout</code> 이지만 rewrite 로 다른 배포본이 응답한다.
          <br />
          <strong>채택되지 않은 방식이다.</strong> zone 경계를 넘을 때 페이지 전체가 다시 로드되는
          하드 내비게이션이 강제되고, 런타임 상태 공유가 없어 장바구니는{" "}
          <code>localStorage</code> 를 통해서만 이어진다. 실제 결제 경로는{" "}
          <code>/checkout</code>(cart remote, SSR + 소프트 내비게이션)이다.
        </p>
      </section>
      <CheckoutForm />
    </>
  );
}
