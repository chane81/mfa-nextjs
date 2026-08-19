import type { ComponentType } from 'react';

import type { Product, ProductCategory } from './product';

/**
 * remote 가 노출(expose)하는 모듈의 타입 계약.
 * host 는 이 타입만 알면 되고, 구현은 런타임에 로드된다.
 */

export interface ProductGridProps {
  category?: ProductCategory | 'all';
  /** host 가 라우팅을 소유하므로 상세 이동은 콜백으로 위임 */
  onSelect?: (product: Product) => void;
}

export interface ProductDetailProps {
  productId: string;
}

export interface CartPanelProps {
  /** 결제 진입은 host 의 라우팅 책임 (remote 는 라우터를 모른다) */
  onCheckout?: () => void;
  compact?: boolean;
}

export interface CartBadgeProps {
  label?: string;
}

export interface CheckoutFlowProps {
  /** 주문 완료 후 host 가 어디로 보낼지 결정 */
  onDone?: () => void;
  onContinueShopping?: () => void;
}

/** remote 이름 → 노출 모듈 경로 → 컴포넌트 타입 매핑 */
export interface RemoteModuleMap {
  'catalog/ProductGrid': { default: ComponentType<ProductGridProps> };
  'catalog/ProductDetail': { default: ComponentType<ProductDetailProps> };
  'cart/CartPanel': { default: ComponentType<CartPanelProps> };
  'cart/CartBadge': { default: ComponentType<CartBadgeProps> };
  'cart/CheckoutFlow': { default: ComponentType<CheckoutFlowProps> };
}

export type RemoteModuleId = keyof RemoteModuleMap;

/**
 * remote 이름의 원본은 `@mfa/remote-config` 다 — 포트·env 이름 같은 배치 정보와
 * 같은 자리에 있어야 remote 를 늘리거나 지울 때 한 곳만 보면 된다.
 *
 * 여기서 재-export 하는 이유는 소비처 때문이다. host 는 이 이름과 `RemoteModuleMap` 을
 * 거의 항상 같이 쓰므로 import 를 둘로 쪼개면 읽기만 나빠진다.
 */
export { REMOTE_NAMES, type RemoteName } from '@mfa/remote-config';
