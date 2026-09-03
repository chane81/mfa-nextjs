
    export type RemoteKeys = 'catalog/ProductDetail' | 'catalog/ProductGrid' | 'catalog/RelatedProducts';
    type PackageType<T> = T extends 'catalog/RelatedProducts' ? typeof import('catalog/RelatedProducts') :T extends 'catalog/ProductGrid' ? typeof import('catalog/ProductGrid') :T extends 'catalog/ProductDetail' ? typeof import('catalog/ProductDetail') :any;