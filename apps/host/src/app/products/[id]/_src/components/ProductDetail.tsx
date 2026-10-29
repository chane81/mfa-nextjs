import { RemoteComponent } from '@/mf/components/RemoteComponent';

import { RelatedProductsSection } from './RelatedProductsSection';

/**
 * 상품 상세 영역. 이름이 remote 모듈 `catalog/ProductDetail` 과 같다 — 그 모듈을
 * 감싸 호스트 쪽 조립(관련 상품까지)을 맡는 자리라 일부러 같이 간다.
 *
 * **이 컴포넌트가 따로 있는 이유는 `params` 다.** `cacheComponents` 를 켜면 `params`
 * 접근도 런타임 데이터라, `Suspense` 밖에서 await 하면 프리렌더가 막힌다
 * (`blocking-prerender-dynamic`). 그래서 읽는 부분만 경계 안쪽 컴포넌트로 떼어 둔다.
 *
 * 같은 remote 의 모듈 둘을 한 경계 안에서 쓴다. 둘 다 `id` 하나만 필요하므로
 * `params` 를 두 번 읽지 않는다.
 *
 * 상세는 `RemoteComponent` 를 그대로 부른다. **콜백이 없으면 Section 을 만들지 않는다** —
 * 한때 `ProductDetailSection` 이 있었는데 `'use client'` 선언 하나와 위임 한 줄이 전부라,
 * 새 remote 모듈을 붙일 때 세는 파일 수만 늘리고 감추는 것은 없었다.
 * 관련 상품은 `onSelect` 콜백(`useRouter`)이 필요해서 Section 이 남는다.
 */
export async function ProductDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <div className="flex flex-col gap-6">
      <RemoteComponent
        module="catalog/ProductDetail"
        fallbackLabel="catalog remote 에서 상세 불러오는 중…"
        props={{ productId: id }}
      />
      <RelatedProductsSection productId={id} />
    </div>
  );
}
