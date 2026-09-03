import { type CartLine } from '@mfa/contracts';
/** 이 모듈의 공개 계약 — `initialLines` 의 의미는 `CartPanel.tsx` 의 같은 주석 */
export interface CheckoutFlowProps {
    initialLines?: readonly CartLine[];
    /** 주문 완료 후 host 가 어디로 보낼지 결정 */
    onDone?: () => void;
    onContinueShopping?: () => void;
}
/**
 * host 에 노출되는 모듈: `cart/CheckoutFlow`
 *
 * 원래 별도 Next.js 앱(Multi-Zone)이 담당하던 결제 화면을 remote 로 옮겼다.
 * 이유: zone 경계를 넘으면 하드 내비게이션이 강제되어 SPA 설계가 무의미해진다.
 * remote 로 두면 라우팅이 host 안에 남아 소프트 내비게이션이 유지된다.
 */
export default function CheckoutFlow({ onDone, onContinueShopping, initialLines, }: CheckoutFlowProps): import("react").JSX.Element;
