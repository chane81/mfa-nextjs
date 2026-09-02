
    export type RemoteKeys = 'cart/CartBadge' | 'cart/CartPanel' | 'cart/CheckoutFlow';
    type PackageType<T> = T extends 'cart/CheckoutFlow' ? typeof import('cart/CheckoutFlow') :T extends 'cart/CartPanel' ? typeof import('cart/CartPanel') :T extends 'cart/CartBadge' ? typeof import('cart/CartBadge') :any;