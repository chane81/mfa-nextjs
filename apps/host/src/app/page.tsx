import { tokens } from '@mfa/ui';

import { CartSection } from '@/components/CartSection';
import { CatalogSection } from '@/components/CatalogSection';

/**
 * host 홈. 이 파일 자체는 Server Component 지만
 * 아래 두 섹션은 client boundary 안에서 remote 를 런타임 로드한다.
 */
export default function HomePage() {
  return (
    <>
      <section
        style={{
          border: `1px solid ${tokens.color.border}`,
          borderRadius: tokens.radius.lg,
          padding: tokens.space(6),
          background: tokens.color.surface,
        }}
      >
        <h1 style={{ margin: 0, fontSize: 22 }}>
          Next.js 16 host + 런타임 Module Federation
        </h1>
        <p
          style={{
            color: tokens.color.textMuted,
            fontSize: 14,
            lineHeight: 1.7,
          }}
        >
          이 페이지의 뼈대(헤더 · 레이아웃 · 라우팅)는 <strong>host</strong> 가
          SSR 하고, 점선으로 감싸인 영역은 브라우저에서 별도 배포된 remote
          번들을 받아 그린다.
          <br />
          보라색 = <code>catalog</code> (Vite), 초록색 = <code>cart</code>{' '}
          (Rsbuild).
        </p>
      </section>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 2fr) minmax(280px, 1fr)',
          gap: tokens.space(6),
          alignItems: 'start',
        }}
      >
        <CatalogSection />
        <CartSection compact />
      </div>
    </>
  );
}
