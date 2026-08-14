"use client";

import { Suspense, lazy, type ComponentType } from "react";

import type { RemoteModuleId, RemoteModuleMap } from "@mfa/contracts";
import { Skeleton } from "@mfa/ui";

import { REMOTE_ENTRIES, loadRemoteModule } from "./runtime";
import { RemoteBoundary } from "./RemoteBoundary";

type PropsOf<K extends RemoteModuleId> =
  RemoteModuleMap[K]["default"] extends ComponentType<infer P> ? P : never;

/**
 * lazy() 는 반드시 렌더 바깥에서 한 번만 만들어야 한다.
 * 렌더마다 새로 만들면 remote 컴포넌트 상태가 매번 초기화된다.
 */
const lazyCache = new Map<RemoteModuleId, ComponentType<Record<string, unknown>>>();

function getLazyRemote(id: RemoteModuleId): ComponentType<Record<string, unknown>> {
  const cached = lazyCache.get(id);
  if (cached) return cached;

  const Component = lazy(
    () => loadRemoteModule(id) as Promise<{ default: ComponentType<Record<string, unknown>> }>,
  );
  lazyCache.set(id, Component);
  return Component;
}

interface RemoteComponentProps<K extends RemoteModuleId> {
  module: K;
  props?: PropsOf<K>;
  fallbackLabel?: string;
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
}: RemoteComponentProps<K>) {
  const remoteName = moduleId.split("/")[0] as keyof typeof REMOTE_ENTRIES;
  const placeholder = <Skeleton label={fallbackLabel ?? `${moduleId} 불러오는 중…`} />;

  // lazyCache 덕분에 moduleId 당 컴포넌트 정체성이 고정된다.
  // 린터는 "렌더 중 컴포넌트 생성"으로 보지만 실제로는 모듈 스코프 캐시에서 꺼내 쓴다.
  const Remote = getLazyRemote(moduleId);

  return (
    <RemoteBoundary remoteName={remoteName} entry={REMOTE_ENTRIES[remoteName]}>
      <Suspense fallback={placeholder}>
        {/* eslint-disable-next-line react-hooks/static-components */}
        <Remote {...(props as Record<string, unknown>)} />
      </Suspense>
    </RemoteBoundary>
  );
}
