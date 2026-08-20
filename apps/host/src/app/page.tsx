import { CartSection } from '@/components/CartSection';
import { CatalogSection } from '@/components/CatalogSection';
import { readCartLines } from '@/lib/cart-cookie';

/**
 * 이 라우트는 **요청을 기다렸다 렌더한다.**
 *
 * `cacheComponents` 는 모든 페이지가 비어 있지 않은 정적 셸을 만들어내는지 검증하는데,
 * 장바구니 쿠키를 `<Suspense>` 밖에서 읽는 순간 그 검증에 걸린다(빌드 에러
 * `blocking-prerender-dynamic`). `instant = false` 가 그 검증에서 빼주는 공식 통로다.
 *
 * Suspense 로 감싸는 쪽도 가능하지만 그러면 장바구니가 스트리밍으로 나중에 도착해
 * **없애려던 전이가 그대로 돌아온다.** 셸을 잃는 대신 첫 HTML 을 맞추는 쪽을 고른다.
 * 문서 지침대로 루트 레이아웃이 아니라 이 페이지에만 건다 — 위에 걸면 `/lab` 의
 * 캐시 실험까지 검증에서 빠진다. 근거: ADR-014
 */
export const instant = false;

/**
 * host 홈. 이 파일 자체는 Server Component 지만
 * 아래 두 섹션은 client boundary 안에서 remote 를 런타임 로드한다.
 *
 * 장바구니 쿠키를 `<Suspense>` 밖에서 읽으므로 이 라우트는 프리렌더되지 않고 요청마다
 * 렌더된다. 의도한 대가다 — 첫 HTML 에 장바구니가 들어가야 전이가 없다(ADR-014).
 */
export default async function HomePage() {
  const initialLines = await readCartLines();

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
        <CartSection compact initialLines={initialLines} />
      </div>
    </>
  );
}
