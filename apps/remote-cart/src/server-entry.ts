import CartBadge from './exposes/CartBadge.js';
import CartPanel from './exposes/CartPanel.js';
import CheckoutFlow from './exposes/CheckoutFlow.js';

/**
 * SSR 전용 진입점 (node 타깃 CJS 번들).
 * 키는 rsbuild.config.ts 의 `exposes` 키와 1:1 로 맞춘다.
 */
const exposes = {
  './CartPanel': CartPanel,
  './CartBadge': CartBadge,
  './CheckoutFlow': CheckoutFlow,
};

export default exposes;
