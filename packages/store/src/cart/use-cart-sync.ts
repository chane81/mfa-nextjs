'use client';

import { useEffect } from 'react';

import { useRevalidateOnFocus } from '../hooks';
import { globalSingleton, readCookie } from '../utils';

import { CART_COOKIE_NAME } from './cookie-codec';
import { useCart } from './create-store';

/**
 * 탭 사이에서 장바구니가 갈라지는 걸 막는다. **이 훅을 부르는 화면이 하나라도 있으면 된다.**
 *
 * ## 무엇을 고치나
 *
 * 각 탭은 로드 시점에 쿠키를 한 번 읽고 그 뒤로는 메모리 상태를 쥔다. 탭 A 가 상품을
 * 담으면 쿠키는 갱신되지만 탭 B 는 모른다. 그 상태로 B 에서 수량을 바꾸면 persist 가
 * **B 의 낡은 전체 상태**를 쿠키에 되쓰고, A 가 담은 게 사라진다.
 *
 * localStorage 시절에도 같았다. 이 브랜치가 만든 버그는 아니다. 다만 **성질이 바뀌었다** —
 * 이제 서버는 요청마다 맞는 쿠키를 읽어 `initialLines` 로 내려보내는데, `useHydrated` 가
 * 커밋 후 `true` 로 고정이라 소프트 내비게이션마다 도착하는 그 맞는 값을 클라이언트가
 * 계속 버린다. 서버가 답을 아는데 못 쓰는 구조라 고칠 값어치가 생겼다.
 *
 * ## 어떻게
 *
 * 탭이 다시 앞으로 나올 때 쿠키 원문을 확인하고, **바뀌었을 때만** persist 의
 * `rehydrate()` 를 부른다. 파싱을 여기서 다시 구현하지 않는다 — 저장소가 이미 쥔 경로다.
 *
 * 원문 비교가 핵심이다. 없으면 포커스마다 `rehydrate()` 가 돌고, 내용이 같아도 새 배열
 * 참조가 생겨 화면이 매번 다시 그려진다.
 *
 * ## 한계
 *
 * 실시간이 아니다. 두 탭을 나란히 띄워 놓고 한쪽만 조작하면 다른 쪽은 포커스를 받기 전까지
 * 옛 값을 보여준다. 실시간이 되려면 `cookieStore.onchange` 가 필요한데 Chromium 계열
 * 전용이다(근거는 `[[use-revalidate-on-focus]]`). **사용자가 그 탭을 보는 순간에는 맞는
 * 값**이라는 게 이 훅이 보장하는 전부고, 덮어쓰기를 막는 데는 그걸로 충분하다.
 */

/** 스토어에 이미 반영된 쿠키 원문 */
interface AppliedCookie {
  /** `undefined` = 아직 기준선을 안 잡았다. `null` = 쿠키가 없다 */
  value?: string | null;
}

/**
 * 번들 경계를 넘어 하나여야 한다. host 와 remote 가 `@mfa/store` 사본을 각자 가지므로
 * 모듈 스코프 변수로 두면 기준선이 사본 수만큼 생기고, 한 번의 변경에 `rehydrate()` 가
 * 사본 수만큼 돈다. 스토어 인스턴스를 하나로 유지하는 것과 같은 이유다.
 */
const applied = globalSingleton<AppliedCookie>(
  'cart:applied-cookie',
  () => ({}),
);

function syncFromCookie(): void {
  const raw = readCookie(CART_COOKIE_NAME);
  if (raw === applied.value) return;

  applied.value = raw;

  const done = useCart.persist.rehydrate();

  /**
   * 복원은 값을 정규화한다(중복 병합 · 수량 클램프). 그 결과가 쿠키에 되쓰이면 원문이
   * 방금 읽은 것과 달라지므로 기준선을 다시 잡는다. 안 그러면 포커스마다 "바뀌었다"로
   * 읽혀 `rehydrate()` 가 계속 돈다.
   */
  const reseed = () => {
    applied.value = readCookie(CART_COOKIE_NAME);
  };

  // 쿠키 저장소는 동기라 이 경로로 떨어진다. 비동기 저장소로 바뀌어도 깨지지 않게 둘 다 본다
  if (done instanceof Promise) void done.then(reseed);
  else reseed();
}

export function useCartSync(): void {
  useEffect(() => {
    /**
     * 마운트 시점의 쿠키는 스토어 복원이 **이미 반영한** 값이다. 이걸 기준선으로 잡아야
     * 첫 포커스에서 "바뀌었다"로 오판하지 않는다. 기준선을 첫 포커스 때 잡으면 그 사이
     * 다른 탭이 만든 진짜 변경을 기준선으로 삼아 버려, 정작 필요한 복원을 건너뛴다.
     */
    if (applied.value === undefined) {
      applied.value = readCookie(CART_COOKIE_NAME);
    }
  }, []);

  useRevalidateOnFocus(syncFromCookie);
}
