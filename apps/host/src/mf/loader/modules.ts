import type { loadRemote } from '@module-federation/runtime';

import { type RemoteModuleId } from '@mfa/contracts';

// 각 remote 가 "내가 노출하는 키는 이것들" 이라고 **스스로 말한** 목록.
// remote 를 추가하면 여기 한 줄이 는다. 모듈만 추가할 때는 손댈 게 없다.
import type { RemoteKeys as CartKeys } from '../../../@mf-types/cart/apis';
import type { RemoteKeys as CatalogKeys } from '../../../@mf-types/catalog/apis';

/**
 * remote 모듈 id → 그 모듈의 실제 타입.
 *
 * **손으로 적는 표가 없다.** MF DTS 가 `@module-federation/runtime` 을 모듈 확장하면서
 * `loadRemote()` 의 시그니처 자체를 좁혀놓기 때문이다(`@mf-types/index.d.ts`).
 *
 * ```ts
 * declare module '@module-federation/runtime' {
 *   type RemoteKeys = 'catalog/ProductGrid' | … ;
 *   type PackageType<T, Y = any> = T extends 'catalog/ProductGrid'
 *     ? typeof import('catalog/ProductGrid') : … ;
 *   export function loadRemote<T extends RemoteKeys, Y>(p: T): Promise<PackageType<T, Y>>;
 * }
 * ```
 *
 * `PackageType` 자체는 `export` 되지 않아 직접 가져올 수 없다. 그래서 **함수의 반환
 * 타입에서 되꺼낸다.** 실측으로 확인했다 — `RemoteModule<'catalog/ProductGrid'>` 는
 * `typeof import('@mf-types/catalog/ProductGrid')` 로 정확히 좁혀진다.
 *
 * ## 그래서 모듈을 추가할 때 host 는 손댈 게 없다
 *
 * 전에는 이 파일이 `{ 'catalog/ProductGrid': { default: typeof ProductGrid }, … }` 라는
 * 표를 들고 있었다. 모듈마다 import 한 줄 + 표 한 줄이었고, 그건 `@mfa/contracts` 에
 * 있던 `RemoteModuleMap` 을 host 로 옮겨 적은 것에 지나지 않았다.
 *
 * 지금 모듈 하나를 추가하는 절차는 이렇다.
 *
 *   1. remote 에 `src/exposes/NewThing.tsx` 를 만든다 (props 도 그 파일 안에 선언)
 *   2. `@mfa/contracts` 의 `MODULE_IDS` 에 한 줄 등록한다 — **런타임 값이라 필요하다**
 *   3. `pnpm mf:types` 를 돌리고 결과를 커밋한다
 *
 * host 소스는 그대로다.
 *
 * ## 타입의 출처가 remote 다 (예전과 반대)
 *
 * 전에는 `@mfa/contracts` 가 props 를 선언하고 host·remote 가 **둘 다** 그걸 import 했다.
 * 그러면 host 의 기대와 remote 의 구현이 같은 선언을 가리키므로 어긋날 수가 없었고,
 * 어긋나지 않는 대신 **틀려도 알 수 없었다.**
 *
 * 지금은 props 가 remote 의 expose 파일 옆에 있고, DTS 가 그걸 컴파일해 보낸다.
 * 그래서 remote 가 필수 prop 을 하나 늘리면 **host 의 호출부가 컴파일 에러가 된다.**
 *
 * ## 대가 — `@mf-types` 가 저장소에 있어야 한다
 *
 * host 소스가 생성물에 의존한다. 그래서 `apps/host/@mf-types/` 는 **커밋한다.**
 * 안 그러면 `pnpm typecheck` 가 remote 기동을 요구하게 되고, 그건 이 저장소가 DTS 를
 * 오래 껐던 바로 그 이유다. 커밋된 타입이 낡는 문제는 CI 가 `pnpm mf:types` 를 돌린 뒤
 * `git diff` 로 잡는다.
 */
export type RemoteModule<K extends RemoteModuleId> = Awaited<
  ReturnType<typeof loadRemote<K, never>>
>;

/* ------------------------------------------------------------------------- *
 * 계약 대조 — 값 없이 타입만으로 돈다
 * ------------------------------------------------------------------------- */

/** 두 타입이 **정확히** 같을 때만 통과한다 (한쪽 방향 할당 가능성으론 부족하다) */
type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? true
    : false;

/** `true` 가 아니면 컴파일 에러 */
type Expect<T extends true> = T;

/**
 * remote 가 노출한다고 말한 키 ≡ `MODULE_IDS`.
 *
 * `MODULE_IDS` 는 런타임 값이라 손으로 적는다(타입만 주는 DTS 로는 만들 수 없다).
 * 손으로 적은 것이 실제와 어긋나는지를 여기서 본다. 방향이 둘 다 잡힌다.
 *
 *   `MODULE_IDS` 에 있는데 remote 에 없다 → 파일을 지웠거나 이름을 바꿨다
 *   remote 에 있는데 `MODULE_IDS` 에 없다 → `src/exposes/` 에 파일만 넣고 등록을 잊었다
 *
 * 각 remote 의 `exposes/contract.test.ts` 도 두 번째를 잡지만 그건 **디렉터리 스캔**
 * 관점이다. 이쪽은 host 가 받아 본 결과라, remote 의 빌드가 실제로 무엇을 내보냈는지까지
 * 반영한다.
 *
 * ⚠️ 이 별칭은 아무도 쓰지 않는다 — **그게 정상이다.** `tsc` 가 선언을 검사하는 것만으로
 * 목적을 다한다. 지우면 대조가 사라진다.
 */
export type ContractMatchesRemotes = Expect<
  Equal<CatalogKeys | CartKeys, RemoteModuleId>
>;

export type { RemoteModuleId };
