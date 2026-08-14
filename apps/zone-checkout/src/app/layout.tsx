import type { Metadata } from "next";
import type { ReactNode } from "react";

import { tokens } from "@mfa/ui";

export const metadata: Metadata = {
  title: "결제 — zone-checkout",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko">
      <body
        style={{
          margin: 0,
          background: tokens.color.bg,
          color: tokens.color.text,
          fontFamily: tokens.font.body,
          minHeight: "100vh",
        }}
      >
        <header
          style={{
            borderBottom: `1px solid ${tokens.color.border}`,
            background: tokens.color.surface,
            padding: `${tokens.space(4)} ${tokens.space(6)}`,
          }}
        >
          <a href="/" style={{ color: tokens.color.text, textDecoration: "none", fontWeight: 700 }}>
            🛍️ MFA Shop
          </a>
          <span
            style={{
              marginLeft: 8,
              fontFamily: tokens.font.mono,
              fontSize: 11,
              color: "hsl(30 80% 70%)",
            }}
          >
            zone: checkout · 별도 Next 16 앱
          </span>
        </header>
        <main
          style={{
            maxWidth: 840,
            margin: "0 auto",
            padding: `${tokens.space(8)} ${tokens.space(6)}`,
            display: "flex",
            flexDirection: "column",
            gap: tokens.space(6),
          }}
        >
          {children}
        </main>
      </body>
    </html>
  );
}
