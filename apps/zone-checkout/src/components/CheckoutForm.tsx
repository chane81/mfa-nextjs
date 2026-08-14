"use client";

import { useState } from "react";

import { formatKRW } from "@mfa/contracts";
import { Badge, Button, Panel, tokens, useCart } from "@mfa/ui";

export function CheckoutForm() {
  const { lines, totalPriceLabel, totalQuantity, store } = useCart();
  const [placed, setPlaced] = useState(false);

  if (placed) {
    return (
      <Panel origin="zone: checkout" originHue={30} title="주문 완료">
        <p style={{ margin: 0, color: tokens.color.text }}>
          주문이 접수되었습니다. 장바구니를 비웠습니다.
        </p>
        <div>
          <a href="/" style={{ color: tokens.color.accent, fontSize: 13 }}>
            ← host 홈으로 (하드 내비게이션)
          </a>
        </div>
      </Panel>
    );
  }

  return (
    <Panel
      origin="zone: checkout"
      originHue={30}
      title="주문서"
      actions={<Badge hue={30}>{totalQuantity}개</Badge>}
    >
      {lines.length === 0 ? (
        <p style={{ margin: 0, color: tokens.color.textMuted, fontSize: 13 }}>
          장바구니가 비어 있습니다.{" "}
          <a href="/" style={{ color: tokens.color.accent }}>
            상품 담으러 가기
          </a>
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
