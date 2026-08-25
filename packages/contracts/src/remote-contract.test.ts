import { describe, expect, it } from 'vitest';

import {
  REMOTE_NAMES,
  type RemoteModuleId,
  type RemoteName,
} from './remote-contract';

/**
 * remote 계약 드리프트 감지.
 *
 * `RemoteModuleMap` 은 타입이라 런타임에 키를 셀 수 없다. 대신 목록을 한 번 적고
 * **양방향으로** 타입에 묶는다 — `satisfies` 가 잘못된 id 를 막고, 아래 `_Exhaustive`
 * 가 맵에만 추가되고 여기 안 적힌 id 를 막는다. 둘 중 하나라도 어긋나면
 * `pnpm typecheck` 가 먼저 죽는다.
 */
const MODULE_IDS = [
  'catalog/ProductGrid',
  'catalog/ProductDetail',
  'cart/CartPanel',
  'cart/CartBadge',
  'cart/CheckoutFlow',
] as const satisfies readonly RemoteModuleId[];

type _Exhaustive =
  Exclude<RemoteModuleId, (typeof MODULE_IDS)[number]> extends never
    ? true
    : never;
const _exhaustive: _Exhaustive = true;

/** 모듈 id 의 접두사는 반드시 remote 이름이어야 한다 (타입 수준) */
type Prefix<T> = T extends `${infer P}/${string}` ? P : never;
type _PrefixIsRemoteName =
  Prefix<RemoteModuleId> extends RemoteName ? true : never;
const _prefixIsRemoteName: _PrefixIsRemoteName = true;

describe('remote 계약', () => {
  it('모듈 id 의 접두사는 전부 REMOTE_NAMES 안에 있다', () => {
    for (const id of MODULE_IDS) {
      expect(REMOTE_NAMES).toContain(id.split('/')[0]);
    }
  });

  it('모든 remote 가 최소 한 개의 모듈을 노출한다', () => {
    // 아무것도 노출하지 않는 remote 가 배치에만 남아 있으면 dev 가 그걸 기다린다.
    for (const name of REMOTE_NAMES) {
      expect(MODULE_IDS.some((id) => id.startsWith(`${name}/`))).toBe(true);
    }
  });

  it('타입 수준 검사가 살아 있다', () => {
    expect(_exhaustive && _prefixIsRemoteName).toBe(true);
  });
});
