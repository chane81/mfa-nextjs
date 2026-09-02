import { type Product, type ProductCategory } from '@mfa/contracts';
/**
 * 이 모듈의 **공개 계약**. host 는 MF DTS 로 이 타입을 그대로 받아간다
 * (`@mf-types/catalog/ProductGrid`).
 *
 * ## 왜 여기 있나 — `@mfa/contracts` 가 아니라
 *
 * props 를 계약 패키지에 두면 host 와 remote 가 **같은 선언을 가리키게 되어**
 * DTS 가 전달할 정보가 없어진다. 실제로 그 상태에서는 계약을 바꿔도 remote 타입이
 * 따라 바뀌어 대조가 늘 통과했다(known-issues I-2).
 *
 * 선언이 구현 옆에 있으면 DTS 가 이걸 `compiled-types/` 에 인라인해 host 로 보낸다 —
 * 그제서야 "remote 가 실제로 무엇을 받는가"가 host 의 타입이 된다.
 *
 * 도메인 타입(`Product` · `ProductCategory`)은 여전히 `@mfa/contracts` 에서 온다.
 * 그건 host·remote·store 가 **같이 쓰는 어휘**지 이 모듈의 표면이 아니다.
 */
export interface ProductGridProps {
    category?: ProductCategory | 'all';
    /** host 가 라우팅을 소유하므로 상세 이동은 콜백으로 위임 */
    onSelect?: (product: Product) => void;
}
/** host 에 노출되는 모듈: `catalog/ProductGrid` */
export default function ProductGrid({ category, onSelect, }: ProductGridProps): import("react").JSX.Element;
