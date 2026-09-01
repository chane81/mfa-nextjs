import { describe, expect, it } from 'vitest';

import { MODULE_IDS, REMOTE_NAMES, exposedNames } from './remote-contract';

/**
 * remote 계약의 성질.
 *
 * **전에 여기 있던 드리프트 검사는 사라졌다.** `RemoteModuleMap` 과 `MODULE_IDS` 가
 * 같은 id 를 두 번 적던 시절에는 둘을 묶는 장치(`satisfies` · 전수 검사)가 필요했는데,
 * 지금은 둘 다 `MODULES` 객체 하나에서 파생되므로 갈라질 수가 없다. 키 형태
 * (`<remote>/<모듈>`)도 그 객체의 `satisfies` 가 선언 자리에서 막는다.
 *
 * 남은 건 타입으로 표현되지 않는 것들이다.
 */
describe('remote 계약', () => {
  it('모듈 id 의 접두사는 전부 REMOTE_NAMES 안에 있다', () => {
    // 타입은 `${RemoteName}/${string}` 까지만 보장한다. REMOTE_NAMES 는 런타임 배열이라
    // 타입과 값이 갈리는 경우(패키지 버전이 섞이는 등)를 여기서 한 번 더 본다.
    for (const id of MODULE_IDS) {
      expect(REMOTE_NAMES).toContain(id.split('/')[0]);
    }
  });

  it('모든 remote 가 최소 한 개의 모듈을 노출한다', () => {
    // 아무것도 노출하지 않는 remote 가 배치에만 남아 있으면 dev 가 그걸 기다린다.
    for (const name of REMOTE_NAMES) {
      expect(exposedNames(name).length).toBeGreaterThan(0);
    }
  });

  it('MODULE_IDS 는 런타임에 실제로 채워진다', () => {
    // 타입에서 파생된 값이라 빌드가 바뀌면 조용히 비어도 이상하지 않다.
    // 비면 각 remote 의 expose 계약 테스트가 전부 "통과" 해버린다.
    expect(MODULE_IDS.length).toBeGreaterThan(0);
  });

  it('exposedNames 는 접두사를 떼고 이름만 준다', () => {
    expect(exposedNames('catalog')).toEqual(['ProductGrid', 'ProductDetail']);
  });
});
