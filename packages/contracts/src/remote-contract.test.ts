import { describe, expect, it } from 'vitest';

import { MODULE_IDS, REMOTE_NAMES, exposedNames } from './remote-contract';

/**
 * remote 계약의 성질.
 *
 * **이 파일에 props 검사는 없다.** props 는 remote 의 expose 파일이 선언하고 host 는
 * MF DTS 로 받아간다 — 그 대조는 컴파일 타임에 `apps/host/src/mf/loader/modules.ts`
 * 가 한다. 여기 남은 건 **런타임 값인 이름 목록**의 성질뿐이다.
 *
 * 키 형태(`<remote>/<모듈>`)는 `MODULE_IDS` 선언의 `satisfies` 가 그 자리에서 막는다.
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
    // 비면 각 remote 의 expose 계약 테스트가 전부 "통과" 해버린다 —
    // `exposedNames()` 가 빈 배열을 주고 스캔 결과도 빈 배열과 비교되기 때문이다.
    expect(MODULE_IDS.length).toBeGreaterThan(0);
  });

  it('exposedNames 는 접두사를 떼고 이름만 준다', () => {
    expect(exposedNames('catalog')).toEqual(['ProductGrid', 'ProductDetail']);
  });
});
