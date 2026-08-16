import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { PRODUCTS, getCartStore } from '@mfa/contracts';
import { Button, tokens } from '@mfa/ui';

import CartBadge from './exposes/CartBadge.js';
import CartPanel from './exposes/CartPanel.js';

/** remote 단독 실행 셸 (host 없이 개발/디버깅) */
function StandaloneApp() {
  return (
    <main
      style={{
        fontFamily: tokens.font.body,
        color: tokens.color.text,
        background: tokens.color.bg,
        minHeight: '100vh',
        padding: tokens.space(8),
        display: 'flex',
        flexDirection: 'column',
        gap: tokens.space(6),
      }}
    >
      <header
        style={{ display: 'flex', alignItems: 'center', gap: tokens.space(4) }}
      >
        <h1 style={{ margin: 0, fontSize: 18 }}>cart remote — standalone</h1>
        <CartBadge />
      </header>
      <div style={{ display: 'flex', gap: tokens.space(2), flexWrap: 'wrap' }}>
        {PRODUCTS.slice(0, 4).map((product) => (
          <Button
            key={product.id}
            variant="ghost"
            onClick={() => getCartStore().add(product)}
          >
            {product.emoji} {product.name} 담기
          </Button>
        ))}
      </div>
      <CartPanel
        onCheckout={() => window.alert('host 가 결제 라우팅을 담당합니다')}
      />
    </main>
  );
}

const container = document.getElementById('root');
if (!container) throw new Error('#root 엘리먼트를 찾을 수 없습니다');

createRoot(container).render(
  <StrictMode>
    <StandaloneApp />
  </StrictMode>,
);
