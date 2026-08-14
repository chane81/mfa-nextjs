import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { tokens } from "@mfa/ui";

import ProductDetail from "./exposes/ProductDetail.js";
import ProductGrid from "./exposes/ProductGrid.js";

/**
 * remote 단독 실행 셸.
 * MFA 에서 remote 는 host 없이도 독립 개발/테스트가 가능해야 한다.
 */
function StandaloneApp() {
  return (
    <main
      style={{
        fontFamily: tokens.font.body,
        color: tokens.color.text,
        background: tokens.color.bg,
        minHeight: "100vh",
        padding: tokens.space(8),
        display: "flex",
        flexDirection: "column",
        gap: tokens.space(6),
      }}
    >
      <h1 style={{ margin: 0, fontSize: 18 }}>catalog remote — standalone</h1>
      <ProductGrid />
      <ProductDetail productId="kb-001" />
    </main>
  );
}

const container = document.getElementById("root");
if (!container) throw new Error("#root 엘리먼트를 찾을 수 없습니다");

createRoot(container).render(
  <StrictMode>
    <StandaloneApp />
  </StrictMode>,
);
