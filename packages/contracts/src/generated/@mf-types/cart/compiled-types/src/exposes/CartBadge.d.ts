import type { CartLine } from '@mfa/contracts';
/** 이 모듈의 공개 계약 — `initialLines` 의 의미는 `CartPanel.tsx` 의 같은 주석 */
export interface CartBadgeProps {
    initialLines?: readonly CartLine[];
    label?: string;
}
/**
 * host 에 노출되는 모듈: `cart/CartBadge`
 * host 헤더에 박히는 아주 작은 remote — "조각 단위 소비" 실험용.
 */
export default function CartBadge({ label, initialLines, }: CartBadgeProps): import("react").JSX.Element;
