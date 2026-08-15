"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { tokens } from "@mfa/ui";

import { RemoteComponent } from "@/mf/RemoteComponent";

const NAV = [
  { href: "/", label: "홈" },
  { href: "/cart", label: "장바구니" },
  // /checkout 은 host 라우트 + cart remote → 소프트 내비게이션
  { href: "/checkout", label: "결제" },
  { href: "/debug", label: "MF 진단" },
  // SSR / ISR / Cache Components 비교 실험
  { href: "/lab", label: "캐시 실험" },
] as const;

export function SiteHeader() {
  const pathname = usePathname();

  return (
    <header
      style={{
        borderBottom: `1px solid ${tokens.color.border}`,
        background: tokens.color.surface,
        position: "sticky",
        top: 0,
        zIndex: 10,
      }}
    >
      <div
        style={{
          maxWidth: 1120,
          margin: "0 auto",
          padding: `${tokens.space(4)} ${tokens.space(6)}`,
          display: "flex",
          alignItems: "center",
          gap: tokens.space(6),
          flexWrap: "wrap",
        }}
      >
        <Link
          href="/"
          style={{ color: tokens.color.text, textDecoration: "none", fontWeight: 700 }}
        >
          🛍️ MFA Shop
          <span
            style={{
              marginLeft: 8,
              fontFamily: tokens.font.mono,
              fontSize: 11,
              color: tokens.color.textMuted,
            }}
          >
            host · next 16
          </span>
        </Link>

        <nav style={{ display: "flex", gap: tokens.space(4), flex: 1 }}>
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              style={{
                color: pathname === item.href ? tokens.color.accent : tokens.color.textMuted,
                textDecoration: "none",
                fontSize: 14,
              }}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        {/* 헤더 배지 자체가 cart remote 에서 온다 */}
        <RemoteComponent module="cart/CartBadge" fallbackLabel="🛒 …" />
      </div>
    </header>
  );
}
