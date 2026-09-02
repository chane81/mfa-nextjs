import type { RemoteName } from '@mfa/remote-config';

/**
 * remote 가 **무엇을 노출하는가** — 이름 목록.
 *
 * ## props 타입은 여기 없다
 *
 * 전에는 이 파일이 각 모듈의 props 까지 들고 있었고, remote 가 그걸 import 해서 썼다.
 * 그러면 host 와 remote 가 **같은 선언을 가리키게 된다.** MF DTS 를 켜도 remote 가
 * 보내오는 타입이 다시 이 파일을 import 하므로 전달되는 정보가 0 이었다 — 계약을 바꿔도
 * 대조가 늘 통과했다(known-issues I-2).
 *
 * 그래서 방향을 뒤집었다. **props 는 구현 옆에 산다** — 각 remote 의 `src/exposes` 안이다.
 * DTS 가 그걸 컴파일해 host 로 보내고, host 는 `loadRemote()` 의 좁혀진 시그니처에서
 * 모듈 타입을 되꺼낸다(`apps/host/src/mf/loader/modules.ts` 의 `RemoteModule<K>`).
 * 이제 remote 가 props 를 바꾸면 host 의 호출부가 **실제로** 깨진다.
 *
 * ## 그럼 여기 남는 건 뭔가
 *
 * **런타임에 셀 수 있는 이름 목록** 하나다. 타입은 DTS 가 주지만 DTS 는 타입뿐이라
 * "노출 모듈이 몇 개인가"를 코드가 물어볼 수 없다. 그걸 묻는 자리가 셋이다.
 *
 *   각 remote 의 `exposes/contract.test.ts`   디렉터리 스캔 결과와 대조
 *   host 의 `/debug`                          매니페스트 프로브 대상
 *   host 의 `loader/modules.ts`               DTS 가 준 키 집합과 대조
 *
 * 마지막이 이 목록의 안전장치다. 목록과 실제 remote 가 어긋나면 거기서 컴파일이 죽는다.
 *
 * ## ⚠️ 이 파일은 `@mf-types` 를 **쓸 수 없다**
 *
 * "DTS 가 `RemoteKeys` 를 주는데 왜 목록을 손으로 적나" 는 자연스러운 질문이다.
 * 세 가지가 막는다.
 *
 * 1. **부트스트랩 순환 (실측).** 이 패키지를 두 remote 가 직접 import 한다
 *    (`src/exposes` 안에서 `Product` · `CartLine` 을 쓴다). 그런데 `@mf-types` 는
 *    remote 를 빌드한 **뒤에야** 생긴다. 그래서 참조를 넣고 `@mf-types` 를 지워봤더니:
 *
 *      src/remote-contract.ts(2,48): error TS2307:
 *        Cannot find module '../../../apps/host/@mf-types/catalog/apis'
 *
 *    `@mf-types` 를 만들려면 remote 를 빌드해야 하고, remote 빌드는 이 패키지를
 *    필요로 한다. **깨끗한 체크아웃에서 아무것도 빌드할 수 없다.**
 *
 * 2. **패키지 경계.** `@mf-types` 는 host 앱 안에 있다. 공유 패키지가 특정 앱의
 *    생성물을 `../../../apps/host/…` 로 가리키면 그 앱 없이는 이 패키지를 못 쓴다.
 *    그 상대경로는 `dist/*.d.ts` 에 **그대로 남는다**(실측) — `src` 와 `dist` 의 깊이가
 *    같아서 저장소 안에서는 우연히 풀리지만, `files: ["dist"]` 로 나가는 순간 깨진다.
 *
 * 3. **값과 타입.** 위 목록은 런타임 배열이고 DTS 는 `.d.ts` 뿐이다. `RemoteKeys` 로
 *    타입은 바꿔 끼울 수 있어도 **값은 못 만든다.**
 *
 * 그래서 `@mf-types` 를 읽는 자리는 **host 하나**다(`loader/modules.ts`).
 * 이 목록이 거기서 `RemoteKeys` 와 대조되므로, 손으로 적은 값이 틀리면 host 의
 * 컴파일이 죽는다 — 검증은 그쪽에 있고 선언만 여기 있다.
 */
export const MODULE_IDS = [
  'catalog/ProductGrid',
  'catalog/ProductDetail',
  'cart/CartPanel',
  'cart/CartBadge',
  'cart/CheckoutFlow',
] as const satisfies readonly `${RemoteName}/${string}`[];

/**
 * 노출 모듈 id. `MODULE_IDS` 에서 파생된다 — 값이 원본이고 타입이 그림자다.
 *
 * `satisfies` 의 원소 타입이 `` `${RemoteName}/${string}` `` 이라, remote 이름이 아닌
 * 접두사를 쓰면 위 선언 자리에서 바로 죽는다.
 */
export type RemoteModuleId = (typeof MODULE_IDS)[number];

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
