import {
  findProduct,
  formatKRW,
  type ProductDetailProps,
} from '@mfa/contracts';
import { useCart } from '@mfa/store';
import { Badge, Button, ErrorBox, Panel } from '@mfa/ui';

/** host 에 노출되는 모듈: `catalog/ProductDetail` */
export default function ProductDetail({ productId }: ProductDetailProps) {
  const add = useCart((state) => state.add);
  const product = findProduct(productId);

  if (!product) {
    return (
      <ErrorBox
        title="상품을 찾을 수 없습니다"
        detail={`productId=${productId}`}
      />
    );
  }

  return (
    <Panel origin="remote: catalog · vite" originHue={280} title="상품 상세">
      <div className="flex flex-wrap gap-6">
        <div className="text-[96px] leading-none">{product.emoji}</div>
        <div className="flex flex-[1_1_260px] flex-col gap-3">
          <h3 className="m-0 text-xl text-text">{product.name}</h3>
          <p className="m-0 text-sm leading-relaxed text-muted">
            {product.description}
          </p>
          <div className="flex flex-wrap gap-2">
            <Badge hue={280}>{product.category}</Badge>
            <Badge hue={45}>★ {product.rating.toFixed(1)}</Badge>
            <Badge hue={product.stock === 0 ? 0 : 140}>
              {product.stock === 0 ? '품절' : `재고 ${product.stock}`}
            </Badge>
          </div>
          <strong className="text-[22px] text-text">
            {formatKRW(product.price)}
          </strong>
          <div>
            <Button disabled={product.stock === 0} onClick={() => add(product)}>
              장바구니에 담기
            </Button>
          </div>
        </div>
      </div>
    </Panel>
  );
}
