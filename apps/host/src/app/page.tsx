import { CartSlot } from '@/components/CartSlot';
import { CatalogSection } from '@/components/CatalogSection';

/**
 * 장바구니를 `<Suspense>` 밖에서 읽는 라우트 — 프리렌더 검증에서 빠진다.
 * 전문은 `[[cart-cookie]]` 의 "부르는 자리가 캐시를 결정한다" 와 ADR-014.
 *
 * 값을 리터럴로 적는다. 라우트 세그먼트 설정은 정적 분석 대상이라 다른 모듈에서
 * `export { instant } from ...` 로 공유할 수 없다 — 이 세 줄이 복제의 한계다.
 */
export const instant = false;

/**
 * host 홈. 이 파일 자체는 Server Component 지만
 * 아래 두 섹션은 client boundary 안에서 remote 를 런타임 로드한다.
 *
 * 장바구니 쿠키를 `<Suspense>` 밖에서 읽으므로(`CartSlot`) 이 라우트는 프리렌더되지 않고
 * 요청마다 렌더된다. 의도한 대가다 — 첫 HTML 에 장바구니가 들어가야 전이가 없다(ADR-014).
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
        <CartSlot compact />
      </div>
    </>
  );
}
