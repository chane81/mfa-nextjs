/**
 * 번들 경계를 넘어 인스턴스를 하나로 유지하는 장치.
 *
 * ## 왜 필요한가
 *
 * host 와 각 remote 는 서로 다른 번들이라 `@mfa/store` 의 **사본을 각자 가진다.**
 * 스토어를 만드는 모듈이 세 번 평가되면 인스턴스도 셋이 되고, 상태가 갈라진다 —
 * "catalog 에서 담았는데 cart 배지는 0" 이 그 증상이다. 상태는 zustand 모듈이 아니라
 * **인스턴스**에 있으므로, 인스턴스 자체를 실행 환경(realm)에 한 번만 심어야 한다.
 * MF `shared` 설정이 어긋나도 버티는 안전장치이기도 하다.
 *
 * ## 레지스트리를 하나만 둔다
 *
 * 도메인마다 `globalThis.__MFA_XXX__` 를 새로 파면 전역이 도메인 수만큼 더러워지고,
 * 키 짓는 규칙이 도메인마다 흩어진다. 여기서는 `Symbol.for` 로 레지스트리 **하나**를
 * 잡고 그 안에서 이름으로 가른다. `Symbol.for` 는 realm 전역 심볼 레지스트리를 쓰므로
 * 번들이 달라도 같은 심볼이 나온다 — 문자열 키처럼 오타로 갈라지지 않는다.
 *
 * ## 알고 있어야 할 성질
 *
 * **먼저 도착한 쪽이 이긴다.** 두 번째 평가에서는 `create` 를 아예 부르지 않는다.
 * 버전이 다른 사본이 섞이면 먼저 로드된 구현이 그대로 쓰인다(MF 에서 실제로 가능한
 * 상황이다). 상태 모양을 바꾸는 배포는 그래서 remote 를 같이 올려야 안전하다.
 */

const REGISTRY = Symbol.for('@mfa/store/singletons');

type GlobalWithRegistry = typeof globalThis & {
  [REGISTRY]?: Map<string, unknown>;
};

/**
 * `name` 에 해당하는 인스턴스를 realm 당 하나만 만든다.
 *
 * ```ts
 * export const cartStore = globalSingleton('cart', createCartStore);
 * ```
 *
 * @param name 레지스트리 안에서의 이름. 도메인 폴더 이름과 맞춘다.
 * @param create 없을 때만 호출된다.
 */
export function globalSingleton<T>(name: string, create: () => T): T {
  const scope = globalThis as GlobalWithRegistry;
  const registry = (scope[REGISTRY] ??= new Map<string, unknown>());

  if (!registry.has(name)) registry.set(name, create());

  return registry.get(name) as T;
}
