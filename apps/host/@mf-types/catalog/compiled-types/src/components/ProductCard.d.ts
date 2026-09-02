import { type Product } from '@mfa/contracts';
export interface ProductCardProps {
    product: Product;
    onSelect?: (product: Product) => void;
}
export declare function ProductCard({ product, onSelect }: ProductCardProps): import("react").JSX.Element;
