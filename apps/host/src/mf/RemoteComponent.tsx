'use client';

import { Suspense, lazy, type ComponentType } from 'react';

import type {
  RemoteModuleId,
  RemoteModuleMap,
  RemoteName,
} from '@mfa/contracts';
import { stylesPath } from '@mfa/remote-config';
import { Skeleton } from '@mfa/ui';

import { REMOTE_ORIGINS } from './remote-endpoints';
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
 *
 * ## remote 의 스타일시트도 여기서 건다
 *
 * remote 컴포넌트는 host 페이지 안에서 렌더되는데 **CSS 는 두 로딩 경로 어디로도
 * 따라오지 않는다.** 브라우저에서는 MF 런타임이 모듈만 가져오고(번들러의 CSS 주입
 * 런타임은 remote 자신의 HTML 진입점에 붙어 있다), 서버에서는 CJS 문자열을 평가할
 * 뿐이라 스타일시트를 실을 자리가 없다.
 *
 * 한때는 remote 의 expose 마다 `<RemoteStyles />` 를 적어 remote 가 자기 주소를
 * 렌더하게 했다. 계약이 remote 안에 닫혀 좋았지만 **expose 를 추가할 때마다 잊으면
 * 조용히 깨지는** 구조였다. 지금은 모든 remote 소비가 지나가는 이 자리에서 한 번 건다 —
 * 반복이 사라지고 누락이 불가능해진다.
 *
 * host 가 remote 의 파일 레이아웃을 아는 셈이지만 새로 생긴 결합은 아니다. 주소를
 * 만드는 곳은 SSOT(`@mfa/remote-config`) 하나고, 같은 패턴을 `webEntryUrl` 이 이미
 * 쓰고 있다. 피해야 하는 건 **host 가 remote 매니페스트를 파싱해 자산 경로를 캐내는**
 * 쪽이고 그건 지금도 하지 않는다.
 *
 * `precedence` 가 붙은 `<link>` 는 React 19 가 `<head>` 로 올리고 같은 `href` 를
 * 중복 제거한다. 한 화면에 같은 remote 의 expose 를 몇 개 놓든 `<link>` 는 하나다.
 * 값을 remote 마다 다르게 두지 않는 이유는 host 스타일시트와의 상대 순서가 remote
 * 개수·로드 순서에 따라 흔들리지 않게 하기 위해서다.
 *
 * ⚠️ `<link>` 는 `Suspense` **밖**에 둔다. 안에 두면 remote 번들을 기다리는 동안
 * 스타일시트 요청이 시작되지 않아, 정작 마크업이 도착했을 때 CSS 를 다시 기다린다.
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
      {/*
        버전은 서버가 심어준 값을 그대로 쓴다(`RemoteVersionSync`). 없으면 버전 없는
        경로로 떨어지는데, 그건 dev 서버가 자산을 서빙하는 주소라 그때는 그게 맞다.
      */}
      <link
        rel="stylesheet"
        href={`${REMOTE_ORIGINS[remoteName]}${stylesPath(knownVersion(remoteName)?.version)}`}
        precedence="mfa-remote"
      />
      <Suspense fallback={placeholder}>
        {/* eslint-disable-next-line react-hooks/static-components */}
        <Remote {...(props as Record<string, unknown>)} />
      </Suspense>
    </RemoteBoundary>
  );
}
