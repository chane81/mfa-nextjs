import type { ComponentType } from 'react';

// 아래에서 재-export 도 하지만 그건 소비처용이다. 재-export 는 로컬 스코프에
// 이름을 들이지 않으므로, 이 파일 안에서 쓰려면 따로 import 해야 한다.
import type { RemoteName } from '@mfa/remote-config';

import type { CartLine } from './cart';
import type { Product, ProductCategory } from './product';

/**
 * remote 가 노출(expose)하는 모듈의 타입 계약.
 * host 는 이 타입만 알면 되고, 구현은 런타임에 로드된다.
 */

export interface ProductGridProps {
  category?: ProductCategory | 'all';
  /** host 가 라우팅을 소유하므로 상세 이동은 콜백으로 위임 */
  onSelect?: (product: Product) => void;
}

export interface ProductDetailProps {
  productId: string;
}

/**
 * host 가 요청 쿠키에서 읽어 넘기는 장바구니.
 *
 * **서버 렌더와 하이드레이션 렌더가 쓰는 값이다.** 스토어는 브라우저에만 있고
 * 그 서버 스냅샷은 빈 장바구니라, 이 값이 없으면 첫 HTML 이 항상 비어 있게 된다.
 * 커밋 이후에는 스토어가 쥔다 — 둘 다 같은 쿠키에서 나오므로 화면은 바뀌지 않는다.
 * **단일 탭 기준이다.** 서버가 HTML 을 보내는 사이 다른 탭이 쿠키를 바꾸면 그 한 번은
 * 값이 갈린다. 좁은 창이고, 포커스가 돌아올 때 `useCartSync` 가 수렴시킨다.
 *
 * remote 는 여전히 쿠키를 모른다. **읽는 건 host, 쓰는 건 store** 고 remote 는 받는다.
 */
interface CartInitialLines {
  initialLines?: readonly CartLine[];
}

export interface CartPanelProps extends CartInitialLines {
  /** 결제 진입은 host 의 라우팅 책임 (remote 는 라우터를 모른다) */
  onCheckout?: () => void;
  compact?: boolean;
}

export interface CartBadgeProps extends CartInitialLines {
  label?: string;
}

export interface CheckoutFlowProps extends CartInitialLines {
  /** 주문 완료 후 host 가 어디로 보낼지 결정 */
  onDone?: () => void;
  onContinueShopping?: () => void;
}

/**
 * props 타입을 **값의 자리에** 실어 두는 표식.
 *
 * 런타임에 하는 일이 없다 — `undefined` 를 돌려주고 아무도 부르지 않는다. 의미는
 * **타입 인자뿐**이고, 이게 있어야 아래 `MODULES` 가 "런타임에 키를 셀 수 있는 값"이면서
 * 동시에 "각 모듈의 props 를 아는 타입"이 된다.
 */
const props = <P>(): ComponentType<P> =>
  undefined as unknown as ComponentType<P>;

/**
 * **모듈을 등록하는 유일한 자리.** 노출 모듈이 늘면 여기 한 줄만 추가한다.
 *
 * ## 왜 타입이 아니라 값인가
 *
 * 전에는 타입 맵(`RemoteModuleMap`)과 런타임 목록(`MODULE_IDS`)이 **따로** 있었고
 * 같은 id 다섯 개를 두 번 적었다. `satisfies` 와 전수 검사로 묶어 둬서 갈라지지는
 * 않았지만, 모듈을 추가할 때 손이 두 번 갔다.
 *
 * 타입에서 값을 뽑는 건 불가능하다(타입은 런타임에 없다). 그래서 **방향을 뒤집었다** —
 * 값 하나를 SSOT 로 두고 타입을 거기서 파생한다. 이제 `RemoteModuleMap` 도
 * `MODULE_IDS` 도 이 객체의 그림자다.
 *
 * ## 왜 props 타입까지는 자동이 아닌가
 *
 * remote 컴포넌트에서 props 를 뽑아내려면 이 패키지가 remote 소스를 import 해야 한다.
 * 그게 MF 의 DTS 가 하는 일이고, 두 이유로 껐다 —
 * remote 구현이 곧 계약이 되어 host 기대치가 조용히 따라 바뀌고,
 * `pnpm typecheck` 가 remote 기동을 요구하게 된다. 전문: docs/01-research/03-dts-plugin-review.md
 *
 * 그래서 "무엇을 노출하고 그 props 가 무엇인가"는 **사람이 정한다.** 대신 그 선언이
 * 한 곳이면 된다.
 *
 * ## 키 형태는 선언 자리에서 막는다
 *
 * `satisfies` 의 키 타입이 `` `${RemoteName}/${string}` `` 이라, remote 이름이 아닌
 * 접두사를 쓰면 여기서 바로 죽는다. 전에는 이걸 별도의 타입 수준 단언으로 확인했다.
 */
const MODULES = {
  'catalog/ProductGrid': props<ProductGridProps>(),
  'catalog/ProductDetail': props<ProductDetailProps>(),
  'cart/CartPanel': props<CartPanelProps>(),
  'cart/CartBadge': props<CartBadgeProps>(),
  'cart/CheckoutFlow': props<CheckoutFlowProps>(),
} satisfies Record<`${RemoteName}/${string}`, unknown>;

/**
 * remote 이름 → 노출 모듈 경로 → 컴포넌트 타입 매핑.
 *
 * `MODULES` 에서 파생된다. remote 는 컴포넌트를 `default` 로 내보내므로 그 껍데기만 씌운다.
 */
export type RemoteModuleMap = {
  [K in keyof typeof MODULES]: { default: (typeof MODULES)[K] };
};

export type RemoteModuleId = keyof RemoteModuleMap;

/**
 * remote 이름의 원본은 `@mfa/remote-config` 다 — 포트·env 이름 같은 배치 정보와
 * 같은 자리에 있어야 remote 를 늘리거나 지울 때 한 곳만 보면 된다.
 *
 * 여기서 재-export 하는 이유는 소비처 때문이다. host 는 이 이름과 `RemoteModuleMap` 을
 * 거의 항상 같이 쓰므로 import 를 둘로 쪼개면 읽기만 나빠진다.
 */
export { REMOTE_NAMES, type RemoteName } from '@mfa/remote-config';

/**
 * 노출되는 모듈 id **전부** — 런타임 값이다.
 *
 * 필요한 이유: remote 의 `exposes` 는 `src/exposes/` 를 읽어서 만들어지는데
 * (`readExposes`), 그 결과가 이 목록과 같은지 각 remote 의 `exposes/contract.test.ts`
 * 가 대조한다. 파일만 추가하고 여기 등록을 안 했거나, 등록만 하고 파일이 없는 경우가
 * 거기서 걸린다.
 *
 * `MODULES` 의 키 순서를 그대로 따른다. 정렬이 필요한 쪽에서 정렬한다.
 */
export const MODULE_IDS = Object.keys(MODULES) as RemoteModuleId[];

/** 한 remote 가 노출하는 모듈 이름들 (`catalog/ProductGrid` → `ProductGrid`) */
export function exposedNames(remote: RemoteName): string[] {
  return MODULE_IDS.filter((id) => id.startsWith(`${remote}/`)).map((id) =>
    id.slice(remote.length + 1),
  );
}
