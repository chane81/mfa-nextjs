'use client';

import { Suspense, lazy, type ComponentType } from 'react';

import type {
  RemoteModuleId,
  RemoteModuleMap,
  RemoteName,
} from '@mfa/contracts';
import { Skeleton } from '@mfa/ui';

import { REMOTE_ENTRIES, loadRemoteModule } from './runtime';
import { knownVersion } from './remote-version';
import { RemoteBoundary } from './RemoteBoundary';

type PropsOf<K extends RemoteModuleId> =
  RemoteModuleMap[K]['default'] extends ComponentType<infer P> ? P : never;

/**
 * lazy() 는 반드시 렌더 바깥에서 한 번만 만들어야 한다.
 * 렌더마다 새로 만들면 remote 컴포넌트 상태가 매번 초기화된다.
 *
 * ⚠️ 그런데 **remote 버전을 키에 넣지 않으면 무효화가 로더까지 닿지 않는다.**
 * React 의 `lazy()` 는 한 번 resolve 되면 그 결과를 영구히 들고 있어서, remote 를
 * 재배포하고 번들 캐시를 비워도 이 캐시가 옛 컴포넌트를 프로세스 수명 내내 고정한다.
 * 실측에서 warm 요청이 네트워크를 전혀 타지 않는 형태로 드러났다.
 *
 * 버전이 바뀌면 새 lazy 를 만든다. 컴포넌트 정체성이 바뀌어 remote 상태는 초기화되지만,
 * remote 코드 자체가 교체된 시점이므로 그게 맞다.
 */
const lazyCache = new Map<string, ComponentType<Record<string, unknown>>>();

function getLazyRemote(
  id: RemoteModuleId,
  reloadKey?: string,
): ComponentType<Record<string, unknown>> {
  const remote = id.split('/')[0] as RemoteName;
  // 브라우저에는 서버가 심어준 버전이 있고(RemoteVersionSync), 없으면 unversioned 로 고정된다
  const key = `${id}@${knownVersion(remote)?.version ?? 'unversioned'}${reloadKey ? `#${reloadKey}` : ''}`;

  const cached = lazyCache.get(key);
  if (cached) return cached;

  const Component = lazy(
    () =>
      loadRemoteModule(id) as Promise<{
        default: ComponentType<Record<string, unknown>>;
      }>,
  );
  lazyCache.set(key, Component);
  return Component;
}

interface RemoteComponentProps<K extends RemoteModuleId> {
  module: K;
  props?: PropsOf<K>;
  fallbackLabel?: string;
  /**
   * lazy 캐시를 우회하는 키. warm 경로 전용이다.
   *
   * 같은 버전으로 되돌리는 롤백에서는 그 버전의 lazy 엔트리가 이미 캐시에 남아 있어
   * 로더가 호출되지 않는다. 그러면 "무엇을 적재했는지"가 갱신되지 않아 warm 이
   * 성공을 증명하지 못한다. 이 키를 매번 바꾸면 로더를 반드시 한 번 태운다.
   */
  reloadKey?: string;
}

/**
 * `catalog/ProductGrid` 같은 문자열 하나로 remote 컴포넌트를 렌더링한다.
 *
 * SSR 됨. 서버에서는 `loadRemoteModule` 이 remote 의 node 번들을 가져오고,
 * React 가 Suspense 경계를 기다렸다가 remote 마크업을 초기 HTML 에 담는다.
 * 브라우저는 같은 컴포넌트를 MF 웹 번들로 받아 그 HTML 을 hydrate 한다.
 *
 * remote 하나가 죽어도 host 는 살아야 하므로 RemoteBoundary 로 감싼다.
 */
export function RemoteComponent<K extends RemoteModuleId>({
  module: moduleId,
  props,
  fallbackLabel,
  reloadKey,
}: RemoteComponentProps<K>) {
  const remoteName = moduleId.split('/')[0] as keyof typeof REMOTE_ENTRIES;
  const placeholder = (
    <Skeleton label={fallbackLabel ?? `${moduleId} 불러오는 중…`} />
  );

  // lazyCache 덕분에 moduleId 당 컴포넌트 정체성이 고정된다.
  // 린터는 "렌더 중 컴포넌트 생성"으로 보지만 실제로는 모듈 스코프 캐시에서 꺼내 쓴다.
  const Remote = getLazyRemote(moduleId, reloadKey);

  return (
    <RemoteBoundary remoteName={remoteName} entry={REMOTE_ENTRIES[remoteName]}>
      <Suspense fallback={placeholder}>
        {/* eslint-disable-next-line react-hooks/static-components */}
        <Remote {...(props as Record<string, unknown>)} />
      </Suspense>
    </RemoteBoundary>
  );
}
