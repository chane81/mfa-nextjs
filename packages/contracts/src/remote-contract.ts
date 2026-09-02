import type { loadRemote } from '@module-federation/runtime';

import type { RemoteName } from '@mfa/remote-config';

import { MODULE_IDS, type RemoteModuleId } from './generated/module-ids';

/**
 * host ↔ remote 모듈 계약. **원본은 remote 다.**
 *
 * ## 이 파일이 답하는 것
 *
 *   무슨 모듈이 있나          `RemoteModuleId` — remote 가 공표한 키
 *   그 모듈은 어떤 타입인가   `RemoteModule<K>` — MF DTS 가 실어 온 실제 시그니처
 *   런타임에 셀 수 있나       `MODULE_IDS` — 위 타입과 전수 대조되는 값
 *
 * host 는 이 셋만 알면 된다. 예전에는 `apps/host/src/mf/loader/modules.ts` 가 같은
 * 일을 했는데, 계약 지식이 두 패키지에 걸쳐 있을 이유가 없어서 여기로 합쳤다.
 *
 * ## props 는 여기 없다 — remote 가 소유한다
 *
 * 전에는 이 파일이 각 모듈의 props 까지 들고 있었고 remote 가 그걸 import 해서 썼다.
 * 그러면 host 와 remote 가 **같은 선언을 가리키게 된다.** MF DTS 를 켜도 remote 가
 * 보내오는 타입이 다시 이 파일을 import 하므로 전달되는 정보가 0 이었다 — 계약을 바꿔도
 * 대조가 늘 통과했다(known-issues I-2).
 *
 * 지금은 props 가 각 remote 의 `src/exposes` 안에 있고, DTS 가 그걸 컴파일해 보낸다.
 * remote 가 필수 prop 을 늘리면 **host 의 호출부가 컴파일 에러**가 된다.
 *
 * ## ⚠️ 이 모듈은 배럴(`@mfa/contracts`)에 실리지 않는다
 *
 * `@mfa/contracts/remote` 라는 별도 진입점으로만 나간다. 이유는 **부트스트랩 순환**이다.
 *
 * 이 파일은 `../@mf-types` 를 읽는데, 그건 remote 를 빌드해야 생긴다. 그런데 remote 의
 * `src/exposes` 는 배럴에서 `Product` · `CartLine` 같은 어휘를 가져다 쓴다. 배럴이 이
 * 파일까지 재-export 하면 **remote 빌드가 자기 산출물에서 파생된 것을 요구하게 된다.**
 *
 *   remote 빌드 → @mfa/contracts(배럴) → remote-contract → @mf-types → remote 빌드
 *
 * 진입점을 가르면 그 고리가 끊긴다. remote 는 어휘만 보고, 이 파일은 host 만 본다.
 */

/**
 * 노출 모듈 id 와 그 런타임 목록.
 *
 * **둘 다 생성물이다.** `pnpm mf:types` 가 remote 의 타입 아카이브를 받아
 * `scripts/gen-module-ids.ts` 로 만든다. 원본은 각 remote 의 `src/exposes/` 디렉터리고,
 * 그게 DTS 의 `RemoteKeys` 가 되어 여기까지 온다 — 모듈을 추가할 때 **등록하는 자리가 없다.**
 *
 * ## 왜 `@mf-types` 를 여기서 직접 안 읽나
 *
 * `RemoteModuleId` 를 `RemoteKeys` 에서 바로 만들면 그 import 가 emit 된
 * `dist/remote-contract.d.ts` 에 남는다. 그런데 `.d.ts` 는 tsc 가 `dist` 로 복사하지
 * 않으므로 소비처에서 그 경로가 풀리지 않고, `skipLibCheck` 때문에 **에러도 없이
 * `any` 가 된다**(실측 — host 에서 `RemoteModuleId` 에 없는 키를 넣어도 통과했다).
 * 계약이 조용히 사라지는 종류의 실패라 그대로 둘 수 없다.
 *
 * 생성 파일이 값에서 타입을 파생하면 emit 되는 선언에 외부 참조가 남지 않는다.
 * 생성 결과가 실제 계약과 맞는지는 `./contract-check` 가 `@mf-types` 와 대조한다.
 */
export { MODULE_IDS, type RemoteModuleId } from './generated/module-ids';

/**
 * 모듈 id → 그 모듈의 실제 타입.
 *
 * **손으로 적는 표가 없다.** MF DTS 가 `@module-federation/runtime` 을 모듈 확장하면서
 * `loadRemote()` 의 시그니처 자체를 좁혀놓기 때문이다(`@mf-types/index.d.ts`).
 *
 * ```ts
 * declare module '@module-federation/runtime' {
 *   type PackageType<T, Y = any> = T extends 'catalog/ProductGrid'
 *     ? typeof import('catalog/ProductGrid') : … ;
 *   export function loadRemote<T extends RemoteKeys, Y>(p: T): Promise<PackageType<T, Y>>;
 * }
 * ```
 *
 * `PackageType` 자체는 `export` 되지 않아 직접 가져올 수 없다. 그래서 **함수의 반환
 * 타입에서 되꺼낸다.** 실측으로 확인했다 — `RemoteModule<'catalog/ProductGrid'>` 는
 * `typeof import('catalog/ProductGrid')` 로 정확히 좁혀진다.
 *
 * ⚠️ **그 모듈 확장은 아무도 import 하지 않는다.** 그래서 이 타입을 계산하는 프로그램은
 * `@mf-types/index.d.ts` 를 자기 `include` 에 넣어야 한다. 이 패키지는
 * `tsconfig.json` · `tsconfig.build.json` 이, host 는 `apps/host/tsconfig.json` 이 넣는다.
 * 빠뜨리면 여기서 죽거나(빌드) **조용히 `any` 가 된다**(소비처) — 후자가 위험하다.
 * 실측: host 에서 빼봤더니 remote 가 필수 prop 을 늘려도 아무 말 없이 통과했다.
 *
 * ⚠️ 그 `typeof import('catalog/…')` 는 **bare specifier** 라, 이 타입을 쓰는 프로그램의
 * tsconfig 에 `paths` 매핑이 있어야 풀린다(host 와 이 패키지 양쪽). 없으면 조용히
 * `any` 가 되는 게 아니라 모듈을 못 찾아 에러가 난다 — 침묵하지 않는다.
 */
export type RemoteModule<K extends RemoteModuleId> = Awaited<
  ReturnType<typeof loadRemote<K, never>>
>;

/**
 * remote 이름의 원본은 `@mfa/remote-config` 다 — 포트·env 이름 같은 배치 정보와
 * 같은 자리에 있어야 remote 를 늘리거나 지울 때 한 곳만 보면 된다.
 *
 * 여기서 재-export 하는 이유는 소비처 때문이다. host 는 이 이름과 모듈 id 를
 * 거의 항상 같이 쓰므로 import 를 둘로 쪼개면 읽기만 나빠진다.
 */
export { REMOTE_NAMES, type RemoteName } from '@mfa/remote-config';

/** 한 remote 가 노출하는 모듈 이름들 (`catalog/ProductGrid` → `ProductGrid`) */
export function exposedNames(remote: RemoteName): string[] {
  return MODULE_IDS.filter((id) => id.startsWith(`${remote}/`)).map((id) =>
    id.slice(remote.length + 1),
  );
}
