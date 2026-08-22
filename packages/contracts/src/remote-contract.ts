import type { ComponentType } from 'react';

import type { CartLine } from './cart';
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

/**
 * host 가 요청 쿠키에서 읽어 넘기는 장바구니.
 *
 * **서버 렌더와 하이드레이션 렌더가 쓰는 값이다.** 스토어는 브라우저에만 있고
 * 그 서버 스냅샷은 빈 장바구니라, 이 값이 없으면 첫 HTML 이 항상 비어 있게 된다.
 * 커밋 이후에는 스토어가 쥔다 — 둘 다 같은 쿠키에서 나오므로 화면은 바뀌지 않는다.
 * **단일 탭 기준이다.** 서버가 HTML 을 보내는 사이 다른 탭이 쿠키를 바꾸면 그 한 번은
 * 값이 갈린다. 좁은 창이고, 포커스가 돌아올 때 `useCartSync` 가 수렴시킨다.
 *
 * remote 는 여전히 쿠키를 모른다. **읽는 건 host, 쓰는 건 store** 고 remote 는 받는다.
 */
interface CartInitialLines {
  initialLines?: readonly CartLine[];
}

export interface CartPanelProps extends CartInitialLines {
  /** 결제 진입은 host 의 라우팅 책임 (remote 는 라우터를 모른다) */
  onCheckout?: () => void;
  compact?: boolean;
}

export interface CartBadgeProps extends CartInitialLines {
  label?: string;
}

export interface CheckoutFlowProps extends CartInitialLines {
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
