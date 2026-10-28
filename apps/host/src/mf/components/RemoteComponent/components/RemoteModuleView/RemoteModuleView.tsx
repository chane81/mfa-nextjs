'use client';

import { use } from 'react';

import type { RemoteModulePromise } from '../../libs/module-cache';

/**
 * 적재된 remote 모듈을 그린다. **모듈 스코프에 한 번 정의되는 고정 컴포넌트다** —
 * 어느 remote 를 그리느냐는 컴포넌트 정체성이 아니라 promise 로 전달된다.
 *
 * `use()` 가 promise 를 풀고, 아직이면 바깥 `Suspense` 가, 실패하면 `RemoteBoundary` 가 받는다.
 */
export function RemoteModuleView({
  promise,
  props,
}: {
  promise: RemoteModulePromise;
  props: Record<string, unknown>;
}) {
  const { default: Remote } = use(promise);
  return <Remote {...props} />;
}
