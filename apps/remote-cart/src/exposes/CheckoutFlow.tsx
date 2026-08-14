import { useState } from "react";

import { formatKRW, type CheckoutFlowProps } from "@mfa/contracts";
import { Badge, Button, Panel, tokens, useCart } from "@mfa/ui";

/**
 * host 에 노출되는 모듈: `cart/CheckoutFlow`
 *
 * 원래 별도 Next.js 앱(Multi-Zone)이 담당하던 결제 화면을 remote 로 옮겼다.
 * 이유: zone 경계를 넘으면 하드 내비게이션이 강제되어 SPA 설계가 무의미해진다.
 * remote 로 두면 라우팅이 host 안에 남아 소프트 내비게이션이 유지된다.
 */
export default function CheckoutFlow({ onDone, onContinueShopping }: CheckoutFlowProps) {
  const { lines, totalPriceLabel, totalQuantity, store } = useCart();
  const [placed, setPlaced] = useState(false);

  if (placed) {
    return (
      <Panel origin="remote: cart · rsbuild" originHue={150} title="주문 완료">
        <p style={{ margin: 0, color: tokens.color.text, fontSize: 14 }}>
          주문이 접수되었습니다. 장바구니를 비웠습니다.
        </p>
        <div>
          <Button variant="ghost" onClick={onDone}>
            계속 쇼핑하기
          </Button>
        </div>
      </Panel>
    );
  }

  return (
    <Panel
      origin="remote: cart · rsbuild"
      originHue={150}
      title="주문서"
      actions={<Badge hue={150}>{totalQuantity}개</Badge>}
    >
      {lines.length === 0 ? (
        <p style={{ margin: 0, color: tokens.color.textMuted, fontSize: 13 }}>
          장바구니가 비어 있습니다.{" "}
          <button
            type="button"
            onClick={onContinueShopping}
            style={{
              background: "none",
              border: "none",
              padding: 0,
              color: tokens.color.accent,
              cursor: "pointer",
              fontSize: 13,
              fontFamily: tokens.font.body,
            }}
          >
            상품 담으러 가기
          </button>
        </p>
      ) : (
        <>
          <ul
            style={{
              listStyle: "none",
              margin: 0,
              padding: 0,
              display: "flex",
              flexDirection: "column",
              gap: tokens.space(2),
            }}
          >
            {lines.map((line) => (
              <li
                key={line.productId}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  padding: tokens.space(3),
                  background: tokens.color.surfaceAlt,
                  border: `1px solid ${tokens.color.border}`,
                  borderRadius: tokens.radius.md,
                  fontSize: 13,
                }}
              >
                <span>
                  {line.emoji} {line.name} × {line.quantity}
                </span>
                <span style={{ fontFamily: tokens.font.mono }}>
                  {formatKRW(line.unitPrice * line.quantity)}
                </span>
              </li>
            ))}
          </ul>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              borderTop: `1px solid ${tokens.color.border}`,
              paddingTop: tokens.space(3),
            }}
          >
            <strong>{totalPriceLabel}</strong>
            <Button
              onClick={() => {
                store.clear();
                setPlaced(true);
              }}
            >
              주문 확정
            </Button>
          </div>
        </>
      )}
    </Panel>
  );
}
