import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { PRODUCTS, getCartStore } from '@mfa/contracts';
import { Button } from '@mfa/ui';

import CartBadge from './exposes/CartBadge.js';
import CartPanel from './exposes/CartPanel.js';
import './styles.css';

/**
 * remote 단독 실행 셸 (host 없이 개발/디버깅)
 *
 * **CSS 를 import 하는 곳은 여기 하나다.** expose 는 CSS 를 import 하지 않는다 —
 * host 안에서 렌더될 때는 host 가 `<link>` 로 걸어주기 때문이다(`RemoteComponent`).
 * 그래서 이 import 가 곧 `dist/style.css` 를 만들어 내는 유일한 지점이다 —
 * 지우면 배포 산출물에서 스타일시트가 통째로 사라지고, host 화면까지 같이 무너진다.
 */
function StandaloneApp() {
  return (
    <main className="flex min-h-screen flex-col gap-6 p-8">
      <header className="flex items-center gap-4">
        <h1 className="m-0 text-lg">cart remote — standalone</h1>
        <CartBadge />
      </header>
      <div className="flex flex-wrap gap-2">
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
