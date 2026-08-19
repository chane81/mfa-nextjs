import { CartSection } from '@/components/CartSection';
import { CatalogSection } from '@/components/CatalogSection';

/**
 * host 홈. 이 파일 자체는 Server Component 지만
 * 아래 두 섹션은 client boundary 안에서 remote 를 런타임 로드한다.
 */
export default function HomePage() {
  return (
    <>
      <section className="rounded-lg border border-line bg-surface p-6">
        <h1 className="m-0 text-[22px]">
          Next.js 16 host + 런타임 Module Federation
        </h1>
        <p className="text-sm leading-[1.7] text-muted">
          이 페이지의 뼈대(헤더 · 레이아웃 · 라우팅)는 <strong>host</strong> 가
          SSR 하고, 점선으로 감싸인 영역은 브라우저에서 별도 배포된 remote
          번들을 받아 그린다.
          <br />
          보라색 = <code>catalog</code> (Vite), 초록색 = <code>cart</code>{' '}
          (Rsbuild).
        </p>
      </section>

      <div className="grid grid-cols-[minmax(0,2fr)_minmax(280px,1fr)] items-start gap-6">
        <CatalogSection />
        <CartSection compact />
      </div>
    </>
  );
}
