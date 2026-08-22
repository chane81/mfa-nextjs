import { Badge } from '@mfa/ui';

/**
 * 재고 표시. **품절 판정과 그 색이 한 곳에 있다.**
 *
 * `ProductCard` 와 `ProductDetail` 이 `stock === 0 ? '품절' : \`재고 N\`` 과
 * `hue={stock === 0 ? 0 : 140}` 을 각자 적고 있었다. 판정과 색이 짝인데 두 벌이면
 * 한쪽만 고쳤을 때 "빨간데 재고 3" 같은 상태가 나온다.
 *
 * `@mfa/ui` 가 아니라 여기 있는 이유: 재고는 catalog 의 도메인 개념이고, `@mfa/ui` 는
 * 도메인을 모르는 프리미티브만 담는다(그 패키지 주석 참고).
 */
export function StockBadge({ stock }: { stock: number }) {
  const soldOut = stock === 0;
  return (
    <Badge hue={soldOut ? 0 : 140}>{soldOut ? '품절' : `재고 ${stock}`}</Badge>
  );
}
