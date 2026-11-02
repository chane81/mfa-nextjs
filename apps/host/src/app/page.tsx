import { Suspense } from 'react';

import { Skeleton } from '@mfa/ui';

import { CartSlot } from '@/components/CartSlot';
import { CatalogSlot } from '@/components/CatalogSlot';
import { HomeIntro } from '@/components/HomeIntro';

/**
 * 장바구니를 `<Suspense>` 밖에서 읽는 라우트 — 프리렌더 검증에서 빠진다.
 * 전문은 `[[cart-cookie]]` 의 "부르는 자리가 캐시를 결정한다" 와 ADR-014.
 *
 * 값을 리터럴로 적는다. 라우트 세그먼트 설정은 정적 분석 대상이라 다른 모듈에서
 * `export { instant } from ...` 로 공유할 수 없다 — 이 세 줄이 복제의 한계다.
 */
export const instant = false;

/**
 * host 홈 — 셸과 경계만 둔다. 설명 섹션은 `[[HomeIntro]]` 로 내렸다(배치 규칙 7절).
 * 아래 두 칸은 client boundary 안에서 remote 를 런타임 로드한다.
 *
 * 장바구니 쿠키를 `<Suspense>` 밖에서 읽으므로(`CartSlot`) 이 라우트는 프리렌더되지 않고
 * 요청마다 렌더된다. 의도한 대가다 — 첫 HTML 에 장바구니가 들어가야 전이가 없다(ADR-014).
 */
export default function HomePage() {
  return (
    <>
      <HomeIntro />

      <div className="grid grid-cols-[minmax(0,2fr)_minmax(280px,1fr)] items-start gap-6">
        {/*
          `CatalogSlot` 이 `useSearchParams` 로 필터를 읽는다. 이 라우트는
          `instant = false` 라 프리렌더 대상이 아니지만, 공식 문서가 요구하는 경계를
          그 전제와 무관하게 둔다 — `instant` 를 되돌리는 날 빌드가 깨지지 않게.
        */}
        <Suspense fallback={<Skeleton label="상품 목록 준비 중…" />}>
          <CatalogSlot />
        </Suspense>
        <CartSlot compact />
      </div>
    </>
  );
}
