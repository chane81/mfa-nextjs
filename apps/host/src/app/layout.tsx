import type { Metadata } from 'next';
import { Suspense, type ReactNode } from 'react';

import { SiteHeaderSlot } from '@/components/SiteHeaderSlot';
import { RemoteVersionSync } from '@/mf/components/RemoteVersionSync';

import './globals.css';

export const metadata: Metadata = {
  title: 'MFA Shop — Next.js 16 host',
  description: 'Next.js 16 + Module Federation 런타임 소비 실험',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko">
      {/*
        body 의 배경·글자색·기본 폰트는 `@mfa/tailwind-config` 의 base 레이어에 있다.
        remote 의 스타일시트에도 같은 규칙이 들어가지만 값이 같아 충돌하지 않는다.
      */}
      <body className="m-0">
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

          장바구니 쿠키를 읽는 자리도 **이 경계 안**이다(`SiteHeaderSlot`). 밖에서 읽으면
          레이아웃이라 모든 라우트가 프리렌더에서 빠진다 — `/lab` 의 캐시 실험까지 죽는다.
        */}
        <Suspense fallback={<div className="h-[57px]" />}>
          <SiteHeaderSlot />
        </Suspense>
        <main className="mx-auto flex max-w-[1120px] flex-col gap-6 px-6 py-8">
          {children}
        </main>
      </body>
    </html>
  );
}
