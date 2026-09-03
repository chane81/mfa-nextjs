/** 이 모듈의 공개 계약 — 여기 두는 이유는 `ProductGrid.tsx` 의 같은 주석 */
export interface ProductDetailProps {
    productId: string;
}
/** host 에 노출되는 모듈: `catalog/ProductDetail` */
export default function ProductDetail({ productId }: ProductDetailProps): import("react").JSX.Element;
