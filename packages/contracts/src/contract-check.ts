import type { RemoteName } from '@mfa/remote-config';

// 각 remote 가 "내가 노출하는 키는 이것들" 이라고 **스스로 공표한** 목록.
// `pnpm mf:types` 가 remote 의 타입 아카이브를 받아 만든다.
// remote 를 추가하면 여기 한 줄이 는다. 모듈만 추가할 때는 손댈 게 없다.
import type { RemoteKeys as CartKeys } from './generated/@mf-types/cart/apis';
import type { RemoteKeys as CatalogKeys } from './generated/@mf-types/catalog/apis';
import type { MODULE_IDS, RemoteModuleId } from './generated/module-ids';

/**
 * 생성된 모듈 목록이 **remote 가 실제로 공표한 것과 같은지** 대조한다.
 *
 * ## 왜 별도 파일인가
 *
 * `remote-contract.ts` 가 `@mf-types` 를 직접 import 하면 그 참조가 emit 된
 * `dist/remote-contract.d.ts` 에 남는다. 그런데 `.d.ts` 는 tsc 가 `dist` 로 복사하지
 * 않으므로 소비처에서 그 경로가 풀리지 않고, `skipLibCheck` 때문에 **에러도 없이
 * `any` 가 된다**(실측). 계약이 조용히 사라지는 실패라 그 참조를 emit 되는 선언에서
 * 떼어내야 했다.
 *
 * 이 파일은 **아무것도 export 하지 않는다.** 그래서 emit 되는 `.d.ts` 에 `@mf-types`
 * 참조가 남지 않는다. 검사는 `tsc` 가 이 파일을 컴파일하는 것만으로 끝난다 —
 * `tsconfig.json` 의 `include` 가 이미 `src` 전체를 잡고 있다.
 *
 * ## 무엇을 잡나
 *
 * `scripts/gen-module-ids.ts` 는 `apis.d.ts` 를 정규식으로 파싱한다. dts-plugin 의
 * 출력 포맷이 바뀌면 깨질 수 있고, `pnpm mf:types` 를 안 돌리면 낡는다.
 * **그 스크립트를 믿지 않기 위해** 여기서 전수 대조한다.
 *
 *   생성 목록에 없는데 remote 에 있다 → `src/exposes/` 에 파일을 놓고 갱신을 잊었다
 *   생성 목록에 있는데 remote 에 없다 → 파일을 지웠는데 갱신을 잊었다
 */

/** 두 타입이 **정확히** 같을 때만 통과한다 (한쪽 방향 할당 가능성으론 부족하다) */
type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? true
    : false;

/** `true` 가 아니면 컴파일 에러 */
type Expect<T extends true> = T;

/** 생성된 목록 ≡ remote 가 공표한 키 전체 */
type _ModuleIdsAreExhaustive = Expect<
  Equal<(typeof MODULE_IDS)[number], CatalogKeys | CartKeys>
>;

/**
 * 모듈 id 의 접두사는 remote 이름이어야 한다.
 *
 * remote 의 MF `name` 이 `@mfa/remote-config` 의 키와 어긋나면 여기서 죽는다 —
 * 그 경우 host 의 `init()` 이 등록한 이름과 달라 런타임에 "remote 를 못 찾음" 이 된다.
 */
type _ModuleIdsArePrefixed = Expect<
  RemoteModuleId extends `${RemoteName}/${string}` ? true : false
>;

/**
 * `isolatedModules` 아래에서 모듈로 인정받기 위한 최소 export.
 *
 * ⚠️ **여기에 타입을 export 하지 말 것.** 하나라도 내보내면 `@mf-types` 참조가
 * emit 되는 `.d.ts` 에 다시 살아나고, 위 머리말의 조용한 `any` 문제가 돌아온다.
 */
export {};
