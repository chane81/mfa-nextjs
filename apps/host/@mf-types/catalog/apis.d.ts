
    export type RemoteKeys = 'catalog/ProductDetail' | 'catalog/ProductGrid';
    type PackageType<T> = T extends 'catalog/ProductGrid' ? typeof import('catalog/ProductGrid') :T extends 'catalog/ProductDetail' ? typeof import('catalog/ProductDetail') :any;