import { formatKRW, getCartStore, type Product } from "@mfa/contracts";
import { Badge, Button, tokens } from "@mfa/ui";

export interface ProductCardProps {
  product: Product;
  onSelect?: (product: Product) => void;
}

export function ProductCard({ product, onSelect }: ProductCardProps) {
  const soldOut = product.stock === 0;

  return (
    <article
      style={{
        background: tokens.color.surfaceAlt,
        border: `1px solid ${tokens.color.border}`,
        borderRadius: tokens.radius.md,
        padding: tokens.space(4),
        display: "flex",
        flexDirection: "column",
        gap: tokens.space(3),
      }}
    >
      <div style={{ fontSize: 40, lineHeight: 1 }}>{product.emoji}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: tokens.space(1) }}>
        <button
          type="button"
          onClick={() => onSelect?.(product)}
          style={{
            background: "none",
            border: "none",
            padding: 0,
            textAlign: "left",
            color: tokens.color.text,
            fontSize: 14,
            fontWeight: 600,
            cursor: onSelect ? "pointer" : "default",
            fontFamily: tokens.font.body,
          }}
        >
          {product.name}
        </button>
        <span style={{ color: tokens.color.textMuted, fontSize: 12, lineHeight: 1.5 }}>
          {product.description}
        </span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: tokens.space(2) }}>
        <Badge hue={280}>{product.category}</Badge>
        <Badge hue={soldOut ? 0 : 140}>{soldOut ? "품절" : `재고 ${product.stock}`}</Badge>
        <Badge hue={45}>★ {product.rating.toFixed(1)}</Badge>
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginTop: "auto",
        }}
      >
        <strong style={{ color: tokens.color.text, fontSize: 15 }}>
          {formatKRW(product.price)}
        </strong>
        <Button
          variant="primary"
          disabled={soldOut}
          onClick={() => getCartStore().add(product)}
        >
          담기
        </Button>
      </div>
    </article>
  );
}
