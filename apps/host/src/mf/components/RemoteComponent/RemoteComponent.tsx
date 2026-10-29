'use client';

import { Suspense, type ComponentType } from 'react';

import type {
  RemoteModule,
  RemoteModuleId,
  RemoteName,
} from '@mfa/contracts/remote';
import { Skeleton } from '@mfa/ui';

import { RemoteBoundary } from '../RemoteBoundary';
import { remoteCacheKey, remoteModulePromise } from './libs/module-cache';
import { RemoteModuleView } from './components/RemoteModuleView';
import { RemoteStyleLink } from './components/RemoteStyleLink';

type PropsOf<K extends RemoteModuleId> =
  RemoteModule<K>['default'] extends ComponentType<infer P> ? P : never;

interface RemoteComponentProps<K extends RemoteModuleId> {
  module: K;
  props?: PropsOf<K>;
  fallbackLabel?: string;
  /**
   * 적재 캐시를 우회하는 키. 같은 버전으로 되돌리는 롤백에서 로더를 반드시 한 번 태운다.
   *
   * ⚠️ 지금 이 **prop** 을 쓰는 프로덕션 호출부는 없다 — `MfWarmup` 은 렌더가 아니라 적재라서
   * `loadRemoteModule` 을 직접 부른다. 키 규칙 자체(`remoteCacheKey` 의 둘째 인자)는
   * 그쪽이 계속 쓴다. 검증된 탈출구이지 쓰이는 경로가 아니다.
   */
  reloadKey?: string;
}

/**
 * `catalog/ProductGrid` 같은 문자열 하나로 remote 컴포넌트를 렌더링한다.
 * **모든 remote 소비가 지나가는 단일 진입점**이라 로딩 · 장애 격리 · 스타일시트를 여기서 함께 건다.
 *
 * SSR 된다. 서버는 remote 의 node 번들을 가져와 초기 HTML 에 마크업을 담고,
 * 브라우저는 같은 컴포넌트를 MF 웹 번들로 받아 그 HTML 을 hydrate 한다.
 */
export function RemoteComponent<K extends RemoteModuleId>({
  module: moduleId,
  props,
  fallbackLabel,
  reloadKey,
}: RemoteComponentProps<K>) {
  const remoteName = moduleId.split('/')[0] as RemoteName;

  // 캐시 키가 곧 "지금 그려야 하는 remote 의 정체" 다. 키가 바뀌면 아래 `key` 가
  // 뷰를 갈아끼워 옛 remote 의 상태가 새 코드로 넘어오지 않는다.
  const cacheKey = remoteCacheKey(moduleId, reloadKey);

  return (
    <RemoteBoundary remoteName={remoteName}>
      {/* `Suspense` 밖이라 번들을 기다리는 동안 CSS 요청이 이미 시작된다 */}
      <RemoteStyleLink remoteName={remoteName} />
      <Suspense
        fallback={
          <Skeleton label={fallbackLabel ?? `${moduleId} 불러오는 중…`} />
        }
      >
        <RemoteModuleView
          key={cacheKey}
          promise={remoteModulePromise(cacheKey, moduleId)}
          props={(props ?? {}) as Record<string, unknown>}
        />
      </Suspense>
    </RemoteBoundary>
  );
}
