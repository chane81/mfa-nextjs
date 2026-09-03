/**
 * ⚠️ **자동 생성 파일이다. 손으로 고치지 않는다.**
 *
 * `pnpm mf:types` 가 MF DTS 를 받아온 뒤 `scripts/gen-module-ids.ts` 로 만든다.
 * 원본은 각 remote 의 `src/exposes/` 디렉터리고, 그게 DTS 의 `RemoteKeys` 가 되어
 * 여기까지 온다.
 *
 * ## 왜 타입도 여기서 만드나
 *
 * `RemoteModuleId` 를 `@mf-types` 에서 직접 import 하면 그 참조가 emit 된
 * `dist/remote-contract.d.ts` 에 남는다. 그런데 `.d.ts` 는 tsc 가 `dist` 로
 * 복사하지 않으므로 소비처에서 그 경로가 풀리지 않고, `skipLibCheck` 때문에
 * **에러도 없이 `any` 가 된다**(실측). 계약이 조용히 사라지는 셈이다.
 *
 * 값에서 타입을 파생하면 emit 되는 선언에 외부 참조가 남지 않는다.
 * 이 배열이 실제 계약과 어긋나는지는 `src/contract-check.ts` 가 `@mf-types` 와
 * 대조한다 — 그 파일은 아무것도 export 하지 않아 `d.ts` 에 흔적을 남기지 않는다.
 */
export const MODULE_IDS = [
  'cart/CartBadge',
  'cart/CartPanel',
  'cart/CheckoutFlow',
  'catalog/ProductDetail',
  'catalog/ProductGrid',
  'catalog/RelatedProducts',
] as const;

/** 노출 모듈 id. 위 배열에서 파생된다 — 값이 원본이고 타입이 그림자다. */
export type RemoteModuleId = (typeof MODULE_IDS)[number];
