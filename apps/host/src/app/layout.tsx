import type { Metadata } from "next";
import type { ReactNode } from "react";

import { tokens } from "@mfa/ui";

import { SiteHeader } from "@/components/SiteHeader";

export const metadata: Metadata = {
  title: "MFA Shop — Next.js 16 host",
  description: "Next.js 16 + Module Federation 런타임 소비 실험",
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
        <SiteHeader />
        <main
          style={{
            maxWidth: 1120,
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
