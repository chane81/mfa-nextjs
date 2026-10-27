'use client';

import { Suspense, use, type ComponentType } from 'react';

import type {
  RemoteModule,
  RemoteModuleId,
  RemoteName,
} from '@mfa/contracts/remote';
import { stylesPath } from '@mfa/remote-config';
import { Skeleton } from '@mfa/ui';

import { UNVERSIONED, WEB_ORIGINS } from '../config';
import { loadRemoteModule } from '../loader';
import { remoteVersion } from '../versions';
import { RemoteBoundary } from './RemoteBoundary';

type PropsOf<K extends RemoteModuleId> =
  RemoteModule<K>['default'] extends ComponentType<infer P> ? P : never;

type RemoteModulePromise = Promise<{
  default: ComponentType<Record<string, unknown>>;
}>;

/**
 * 적재 promise 는 반드시 렌더 바깥에서 한 번만 만들어야 한다.
 * 렌더마다 새로 만들면 매번 다시 적재하고 remote 상태가 초기화된다.
 *
 * ⚠️ 그런데 **remote 버전을 키에 넣지 않으면 무효화가 로더까지 닿지 않는다.**
 * 한 번 resolve 된 promise 는 그 결과를 영구히 들고 있어서, remote 를 재배포하고
 * 번들 캐시를 비워도 이 캐시가 옛 모듈을 프로세스 수명 내내 고정한다.
 * 실측에서 warm 요청이 네트워크를 전혀 타지 않는 형태로 드러났다.
 *
 * 버전이 바뀌면 새 promise 를 만들고, 아래 `key` 가 뷰를 갈아끼워 remote 상태를
 * 초기화한다 — remote 코드 자체가 교체된 시점이므로 그게 맞다.
 *
 * 캐시가 들고 있는 것은 **컴포넌트가 아니라 promise** 다. 컴포넌트를 캐시하면
 * (예전의 `lazy()` 방식) 그 값을 렌더 중에 JSX 로 꺼내 쓰게 되고, 그건 "렌더 중
 * 컴포넌트 생성"과 구분이 안 된다. promise 를 캐시하면 화면에 붙는 컴포넌트가
 * 모듈 스코프의 `RemoteModuleView` 하나로 고정된다.
 */
const modulePromises = new Map<string, RemoteModulePromise>();

/**
 * 적재 캐시 키. **버전이 키에 들어가는 것이 핵심**이라 규칙을 함수로 떼어 둔다 —
 * 여기가 조용히 바뀌면 재배포해도 옛 모듈이 프로세스 수명 내내 고정된다.
 */
export function remoteCacheKey(id: RemoteModuleId, reloadKey?: string): string {
  const remote = id.split('/')[0] as RemoteName;
  // 브라우저에는 서버가 심어준 버전이 있고(RemoteVersionSync), 없으면 unversioned 로 고정된다
  const version = remoteVersion(remote) ?? UNVERSIONED;
  return `${id}@${version}${reloadKey ? `#${reloadKey}` : ''}`;
}

function remoteModulePromise(key: string, id: RemoteModuleId) {
  const cached = modulePromises.get(key);
  if (cached) return cached;

  const promise = loadRemoteModule(id) as RemoteModulePromise;
  modulePromises.set(key, promise);
  return promise;
}

/**
 * 적재된 remote 모듈을 그린다. **모듈 스코프에 한 번 정의되는 고정 컴포넌트다** —
 * 어느 remote 를 그리느냐는 컴포넌트 정체성이 아니라 promise 로 전달된다.
 *
 * `use()` 가 promise 를 풀고, 아직이면 바깥 `Suspense` 가 받는다. 실패하면 던져서
 * `RemoteBoundary` 가 받는다 — `lazy()` 때와 같은 동작이다.
 */
function RemoteModuleView({
  promise,
  props,
}: {
  promise: RemoteModulePromise;
  props: Record<string, unknown>;
}) {
  const { default: Remote } = use(promise);
  return <Remote {...props} />;
}

interface RemoteComponentProps<K extends RemoteModuleId> {
  module: K;
  props?: PropsOf<K>;
  fallbackLabel?: string;
  /**
   * 적재 캐시를 우회하는 키.
   *
   * 같은 버전으로 되돌리는 롤백에서는 그 버전의 promise 가 이미 캐시에 남아 있어
   * 로더가 호출되지 않는다. 그러면 "무엇을 적재했는지"가 갱신되지 않는다.
   * 이 키를 매번 바꾸면 로더를 반드시 한 번 태운다.
   *
   * ⚠️ **지금 이 prop 을 쓰는 프로덕션 호출부는 없다.** 유일한 소비자였던 `MfWarmup` 이
   * 38차에 `RemoteComponent` 를 떠났다 — warm 은 렌더가 아니라 적재라서 이제
   * `loadRemoteModule` 을 직접 부르고, 같은 `remoteCacheKey` 규칙에 nonce 를 얹는다.
   * 규칙 자체(`remoteCacheKey` 의 두 번째 인자)는 그쪽이 계속 쓰므로 남겨 둔다.
   * 이 prop 도 남긴다 — 롤백 강제 재적재는 실재하는 필요고 테스트가 붙어 있다.
   * 다만 **다음 소비자가 생기기 전까지는 검증된 탈출구이지 쓰이는 경로가 아니다.**
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
  const remoteName = moduleId.split('/')[0] as RemoteName;
  const placeholder = (
    <Skeleton label={fallbackLabel ?? `${moduleId} 불러오는 중…`} />
  );

  // 캐시 키가 곧 "지금 그려야 하는 remote 의 정체" 다. 키가 바뀌면 아래 `key` 가
  // 뷰를 갈아끼워 옛 remote 의 상태가 새 코드로 넘어오지 않는다.
  const cacheKey = remoteCacheKey(moduleId, reloadKey);

  return (
    <RemoteBoundary remoteName={remoteName}>
      {/*
        버전은 서버가 심어준 값을 그대로 쓴다(`RemoteVersionSync` → `remoteVersion`).
        없으면 버전 없는 경로로 떨어지는데, 그건 dev 서버가 자산을 서빙하는 주소라
        그때는 그게 맞다.
      */}
      <link
        rel="stylesheet"
        href={`${WEB_ORIGINS[remoteName]}${stylesPath(remoteVersion(remoteName))}`}
        precedence="mfa-remote"
      />
      <Suspense fallback={placeholder}>
        <RemoteModuleView
          key={cacheKey}
          promise={remoteModulePromise(cacheKey, moduleId)}
          props={(props ?? {}) as Record<string, unknown>}
        />
      </Suspense>
    </RemoteBoundary>
  );
}
