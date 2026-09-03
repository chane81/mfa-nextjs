import { formatKRW, type CartLine } from '@mfa/contracts';
import { cartTotals, useCart, useCartLines } from '@mfa/store';
import { Button, Panel } from '@mfa/ui';

import { ORIGIN } from '../origin';

/**
 * 이 모듈의 **공개 계약**. host 는 MF DTS 로 이 타입을 그대로 받아간다.
 * 계약 패키지가 아니라 구현 옆에 두는 이유는 catalog 의 `ProductGrid.tsx` 주석.
 *
 * ## `initialLines` — host 가 요청 쿠키에서 읽어 넘기는 장바구니
 *
 * **서버 렌더와 하이드레이션 렌더가 쓰는 값이다.** 스토어는 브라우저에만 있고 그 서버
 * 스냅샷은 빈 장바구니라, 이 값이 없으면 첫 HTML 이 항상 비어 있게 된다. 커밋 이후에는
 * 스토어가 쥔다 — 둘 다 같은 쿠키에서 나오므로 화면은 바뀌지 않는다.
 * **단일 탭 기준이다.** 서버가 HTML 을 보내는 사이 다른 탭이 쿠키를 바꾸면 그 한 번은
 * 값이 갈린다. 좁은 창이고, 포커스가 돌아올 때 `useCartSync` 가 수렴시킨다.
 *
 * remote 는 여전히 쿠키를 모른다. **읽는 건 host, 쓰는 건 store** 고 remote 는 받는다.
 * 이 remote 의 세 모듈이 같은 모양을 받지만 각자 선언한다 — 공개 표면은 모듈 단위고,
 * 하나를 공유해 두면 DTS 가 그 파일을 따로 실어 보내야 한다.
 */
export interface CartPanelProps {
  initialLines?: readonly CartLine[];
  /** 결제 진입은 host 의 라우팅 책임 (remote 는 라우터를 모른다) */
  onCheckout?: () => void;
  compact?: boolean;
}

/** host 에 노출되는 모듈: `cart/CartPanel` */
export default function CartPanel({
  onCheckout,
  compact = false,
  initialLines,
}: CartPanelProps) {
  /** 무엇을 그릴지는 `@mfa/store` 가 정한다 — 하이드레이션 경계도 탭 동기화도 그 안이다 */
  const lines = useCartLines(initialLines);
  const { clear, setQuantity } = useCart((state) => ({
    clear: state.clear,
    setQuantity: state.setQuantity,
  }));

  const { totalQuantity, totalPriceLabel } = cartTotals(lines);

  return (
    <Panel
      {...ORIGIN}
      title="장바구니"
      actions={
        lines.length > 0 ? (
          <Button variant="danger" onClick={() => clear()}>
            비우기
          </Button>
        ) : null
      }
    >
      {lines.length === 0 ? (
        <p className="m-0 text-[13px] text-muted">
          담긴 상품이 없습니다. catalog remote 에서 상품을 담아보세요.
        </p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {lines.map((line) => (
            <li
              key={line.productId}
              className="flex items-center gap-3 rounded-md border border-line bg-surface-alt p-3"
            >
              <span className="text-2xl">{line.emoji}</span>
              <div className="min-w-0 flex-1">
                <div className="overflow-hidden text-[13px] font-semibold text-ellipsis whitespace-nowrap text-text">
                  {line.name}
                </div>
                {!compact ? (
                  <div className="text-xs text-muted">
                    {formatKRW(line.unitPrice)} × {line.quantity}
                  </div>
                ) : null}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  onClick={() => setQuantity(line.productId, line.quantity - 1)}
                >
                  −
                </Button>
                <span className="min-w-5 text-center font-mono text-text">
                  {line.quantity}
                </span>
                <Button
                  variant="ghost"
                  onClick={() => setQuantity(line.productId, line.quantity + 1)}
                >
                  +
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <footer className="flex items-center justify-between border-t border-line pt-3">
        <span className="text-[13px] text-muted">
          {totalQuantity}개 · 합계{' '}
          <strong className="text-text">{totalPriceLabel}</strong>
        </span>
        <Button disabled={lines.length === 0} onClick={onCheckout}>
          결제하기
        </Button>
      </footer>
    </Panel>
  );
}
