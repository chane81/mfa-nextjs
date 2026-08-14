import {
  findProduct,
  formatKRW,
  getCartStore,
  type ProductDetailProps,
} from "@mfa/contracts";
import { Badge, Button, ErrorBox, Panel, tokens } from "@mfa/ui";

/** host 에 노출되는 모듈: `catalog/ProductDetail` */
export default function ProductDetail({ productId }: ProductDetailProps) {
  const product = findProduct(productId);

  if (!product) {
    return <ErrorBox title="상품을 찾을 수 없습니다" detail={`productId=${productId}`} />;
  }

  return (
    <Panel origin="remote: catalog · vite" originHue={280} title="상품 상세">
      <div style={{ display: "flex", gap: tokens.space(6), flexWrap: "wrap" }}>
        <div style={{ fontSize: 96, lineHeight: 1 }}>{product.emoji}</div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: tokens.space(3),
            flex: "1 1 260px",
          }}
        >
          <h3 style={{ margin: 0, color: tokens.color.text, fontSize: 20 }}>{product.name}</h3>
          <p style={{ margin: 0, color: tokens.color.textMuted, lineHeight: 1.6, fontSize: 14 }}>
            {product.description}
          </p>
          <div style={{ display: "flex", gap: tokens.space(2) }}>
            <Badge hue={280}>{product.category}</Badge>
            <Badge hue={45}>★ {product.rating.toFixed(1)}</Badge>
            <Badge hue={product.stock === 0 ? 0 : 140}>
              {product.stock === 0 ? "품절" : `재고 ${product.stock}`}
            </Badge>
          </div>
          <strong style={{ fontSize: 22, color: tokens.color.text }}>
            {formatKRW(product.price)}
          </strong>
          <div>
            <Button disabled={product.stock === 0} onClick={() => getCartStore().add(product)}>
              장바구니에 담기
            </Button>
          </div>
        </div>
      </div>
    </Panel>
  );
}
