'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';

import { PRODUCT_CATEGORIES, type ProductCategory } from '@mfa/contracts';

import { CatalogSection } from '@/components/CatalogSection';

/** 주소창의 값은 사용자가 손으로 고칠 수 있다 — 아는 카테고리만 통과시킨다 */
function toCategory(raw: string | null): ProductCategory | 'all' {
  if (!raw || raw === 'all') return 'all';
  return PRODUCT_CATEGORIES.includes(raw as ProductCategory)
    ? (raw as ProductCategory)
    : 'all';
}

/**
 * 카탈로그의 URL 쪽 껍데기. **주소를 읽고 쓰는 것만** 한다 — `[[CartSlot]]` 이 쿠키에 대해
 * 하는 일의 URL 판이다.
 *
 * ## 왜 갈랐나
 *
 * 카테고리 선택은 remote 안의 상태였다. 그래서 새로고침하면 `all` 로 돌아갔고 그 화면을
 * 링크로 건넬 수도 없었다. **remote 는 URL 을 모르므로**(ADR-013) 그 상태를 어디에 둘지는
 * host 가 정한다.
 *
 * 다만 그 정책은 **라우트마다 다르다.** `CatalogSection` 은 실험 라우트 `/lab/*` 도 같이
 * 쓰는데, 그쪽은 프리렌더 대상이라 `useSearchParams` 가 들어가면 빌드가 깨진다
 * (`CLIENT_HOOK_DYNAMIC`). 그래서 URL 을 아는 코드는 이 파일 하나로 모으고,
 * 부르는 라우트만 이걸 고른다.
 *
 * `replace` 를 쓴다. 필터는 이동이 아니라 같은 화면의 상태라, 누를 때마다 히스토리가
 * 쌓이면 뒤로 가기가 필터 되감기가 된다.
 *
 * ⚠️ `useSearchParams` 는 프리렌더되는 라우트에서 `<Suspense>` 를 요구한다(공식 문서
 * "Missing Suspense boundary"). 부르는 쪽이 경계를 두고 있어야 한다.
 */
export function CatalogSlot() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  return (
    <CatalogSection
      category={toCategory(searchParams.get('category'))}
      onCategoryChange={(next) => {
        const params = new URLSearchParams(searchParams.toString());
        // `all` 은 기본값이라 주소에 남길 이유가 없다 — 지저분해지기만 한다.
        if (next === 'all') params.delete('category');
        else params.set('category', next);

        const query = params.toString();
        // 필터는 제자리 상태 변경이다. 스크롤이 위로 튀면 방금 고른 버튼이 시야에서 벗어난다.
        router.replace(query ? `${pathname}?${query}` : pathname, {
          scroll: false,
        });
      }}
    />
  );
}
