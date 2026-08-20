'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import type { CartLine } from '@mfa/contracts';

import { RemoteComponent } from '@/mf/RemoteComponent';

const NAV = [
  { href: '/', label: '홈' },
  { href: '/cart', label: '장바구니' },
  // /checkout 은 host 라우트 + cart remote → 소프트 내비게이션
  { href: '/checkout', label: '결제' },
  { href: '/debug', label: 'MF 진단' },
  // SSR / ISR / Cache Components 비교 실험
  { href: '/lab', label: '캐시 실험' },
] as const;

export function SiteHeader({
  initialLines,
}: {
  /** 서버가 요청 쿠키에서 읽어 넘긴 장바구니. 배지가 첫 렌더부터 맞는 값을 그린다 */
  initialLines?: readonly CartLine[];
}) {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-10 border-b border-line bg-surface">
      <div className="mx-auto flex max-w-[1120px] flex-wrap items-center gap-6 px-6 py-4">
        <Link
          href="/"
          className="font-bold whitespace-nowrap text-text no-underline"
        >
          🛍️ MFA Shop
          <span className="ml-2 font-mono text-[11px] text-muted">
            host · next 16
          </span>
        </Link>

        {/*
          `whitespace-nowrap` 이 없으면 좁은 화면에서 링크가 **글자 단위로** 쪼개진다
          ("장/바/구/니" 세로 한 줄씩 — 390px 실측). flex 아이템은 기본적으로 축소되므로
          줄바꿈을 링크 단위로만 허용하고 넘칠 자리는 `flex-wrap` 이 만든다.
        */}
        <nav className="flex flex-1 flex-wrap gap-4">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`text-sm whitespace-nowrap no-underline ${
                pathname === item.href ? 'text-accent' : 'text-muted'
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        {/* 헤더 배지 자체가 cart remote 에서 온다 */}
        <RemoteComponent
          module="cart/CartBadge"
          fallbackLabel="🛒 …"
          props={{ initialLines }}
        />
      </div>
    </header>
  );
}
