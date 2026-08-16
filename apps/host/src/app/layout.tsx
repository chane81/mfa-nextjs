import type { Metadata } from 'next';
import { Suspense, type ReactNode } from 'react';

import { tokens } from '@mfa/ui';

import { SiteHeader } from '@/components/SiteHeader';
import { RemoteVersionSync } from '@/mf/RemoteVersionSync';

export const metadata: Metadata = {
  title: 'MFA Shop — Next.js 16 host',
  description: 'Next.js 16 + Module Federation 런타임 소비 실험',
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
          minHeight: '100vh',
        }}
      >
        {/*
          remote 버전을 읽어 globalThis 와 브라우저에 반영한다.
          이게 있어야 웹훅을 못 받은 host 인스턴스도 스스로 재배포를 알아챈다.

          Suspense 로 감싸지 않는다 — 셸 뒤로 스트리밍되면 브라우저 MF 런타임이
          초기화될 때 값이 없어 버전 없는 엔트리로 붙는다. 대신 캐시한다.
        */}
        <RemoteVersionSync />

        {/*
          cacheComponents 를 켜면 `usePathname()` 같은 client hook 이 prerender 를 막는다
          (digest: CLIENT_HOOK_DYNAMIC). Suspense 로 감싸 셸 뒤로 스트리밍시킨다.
          MFA 와 무관한 일반적인 Next 16 이행 비용이다.
        */}
        <Suspense fallback={<div style={{ height: 57 }} />}>
          <SiteHeader />
        </Suspense>
        <main
          style={{
            maxWidth: 1120,
            margin: '0 auto',
            padding: `${tokens.space(8)} ${tokens.space(6)}`,
            display: 'flex',
            flexDirection: 'column',
            gap: tokens.space(6),
          }}
        >
          {children}
        </main>
      </body>
    </html>
  );
}
