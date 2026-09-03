import { type Product } from '@mfa/contracts';
/**
 * 이 모듈의 **공개 계약**. 여기 두는 이유는 `ProductGrid.tsx` 의 같은 주석 —
 * props 를 `@mfa/contracts` 로 올리면 host 와 remote 가 같은 선언을 가리켜
 * DTS 가 전달할 정보가 없어진다(known-issues I-2).
 */
export interface RelatedProductsProps {
    /** 기준 상품. **이 상품 자신은 목록에서 빠진다.** */
    productId: string;
    /** 최대 개수. 기본 3 */
    limit?: number;
    /** host 가 라우팅을 소유하므로 상세 이동은 콜백으로 위임 (ADR-013) */
    onSelect?: (product: Product) => void;
}
/** host 에 노출되는 모듈: `catalog/RelatedProducts` */
export default function RelatedProducts({ productId, limit, onSelect, }: RelatedProductsProps): import("react").JSX.Element | null;
