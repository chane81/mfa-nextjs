/**
 * 레이어 경계를 넘어 하나여야 하는 상태를 담는 자리.
 *
 * ## 왜 globalThis 인가
 *
 * Next 는 RSC 레이어(`react-server` 조건)와 SSR 레이어의 **모듈 그래프를 분리한다.**
 * 같은 파일이 두 번 평가되고 모듈 스코프 변수는 두 벌이 된다. 그래서 한쪽이 쓰고
 * 다른 쪽이 읽는 값은 모듈 스코프에 둘 수 없다.
 *
 * 이 저장소에서 그 경계를 실제로 넘는 값이 넷이다.
 *
 *   remote 버전(공표)   RSC 레이아웃이 조회 → SSR 레이어가 캐시 키로 쓴다
 *   remote 버전(적재)   SSR 레이어가 기록  → RSC Route Handler 가 warm 성공을 판정한다
 *   warm 세대           RSC 라우트가 올림  → SSR 레이어가 캐시를 버릴지 결정한다
 *   로더 계측           SSR 레이어가 올림  → RSC Route Handler 가 읽는다
 *
 * ## 왜 헬퍼로 뽑았나
 *
 * 넷이 각자 `Symbol`/문자열 키, Holder 타입, `??=` 게터를 손으로 반복하고 있었다.
 * 스무 줄 남짓의 보일러플레이트가 네 벌이면 새 값을 추가할 때 어느 걸 복사하는지에 따라
 * 키 짓는 규칙이 갈린다.
 *
 * `@mfa/store` 의 `globalSingleton` 과 하는 일이 같지만 그쪽을 쓰지 않는다.
 * 그 패키지는 **브라우저 런타임 상태**용이고 `'use client'` 그래프에 묶여 있다 —
 * host 서버 전용 값을 담자고 그 경계를 넘으면 ADR-015 가 떼어낸 것을 도로 붙인다.
 *
 * ## 알고 있어야 할 성질
 *
 * **프로세스 수명과 같다.** 재시작하면 사라지고, 인스턴스가 여럿이면 각자 자기 것을
 * 갖는다. 그래서 여기 담는 건 "이 프로세스가 지금 무엇을 들고 있는가" 뿐이고,
 * 인스턴스 간에 수렴해야 하는 값(remote 가 공표한 버전)은 여기가 원본이 아니라
 * **캐시**다 — 원본은 remote 의 `mf-version.json` 이고 각 인스턴스가 스스로 읽는다.
 */

/**
 * `Symbol.for` 로 레지스트리 **하나**를 잡고 그 안에서 이름으로 가른다.
 * 값마다 `globalThis.__mfaXxx` 를 새로 파면 전역이 값 수만큼 더러워지고, 키 짓는
 * 규칙이 흩어진다. `Symbol.for` 는 realm 전역 심볼 레지스트리를 쓰므로 모듈 그래프가
 * 갈려도 같은 심볼이 나온다 — 문자열 키처럼 오타로 조용히 갈라지지 않는다.
 */
const REGISTRY = Symbol.for('@mfa/host/mf-global-state');

type GlobalWithRegistry = typeof globalThis & {
  [REGISTRY]?: Map<string, unknown>;
};

function registry(): Map<string, unknown> {
  const scope = globalThis as GlobalWithRegistry;
  return (scope[REGISTRY] ??= new Map<string, unknown>());
}

/**
 * 레이어를 넘어 공유되는 **가변 셀** 하나.
 *
 * 객체를 돌려주는 이유는 `let` 을 공유할 수 없기 때문이다. 호출부는 이 객체를 모듈
 * 스코프에 붙잡아 두고 `.value` 로 읽고 쓴다 — 참조는 하나고 그 안의 값만 바뀐다.
 */
export interface GlobalCell<T> {
  value: T;
}

/**
 * `name` 에 해당하는 셀을 realm 당 하나만 만든다.
 *
 * ```ts
 * const versions = globalCell('remote-versions', () => ({}) as Versions);
 * versions.value.catalog = info;
 * ```
 *
 * @param name 레지스트리 안에서의 이름. 무엇을 담는지 그대로 적는다.
 * @param create 없을 때만 호출된다. **먼저 도착한 쪽이 이긴다.**
 */
export function globalCell<T>(name: string, create: () => T): GlobalCell<T> {
  const held = registry().get(name);
  if (held) return held as GlobalCell<T>;

  const cell: GlobalCell<T> = { value: create() };
  registry().set(name, cell);
  return cell;
}
