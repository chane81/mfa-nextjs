import { CheckoutSection } from '@/components/CheckoutSection';

/**
 * remote 를 SSR 하므로 요청 시점에 remote 번들을 가져와야 한다.
 * 정적 프리렌더로 굳히면 remote 를 재배포해도 host 가 옛 마크업을 계속 내보낸다.
 */
export default function CheckoutPage() {
  return <CheckoutSection />;
}
