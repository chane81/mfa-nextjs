import { cacheLife, cacheTag } from 'next/cache';

import { REMOTE_NAMES } from '@mfa/contracts';

import {
  fetchRemoteVersion,
  remoteOrigin,
  remoteVersionTag,
} from './remote-version';

/**
 * remote 버전을 새로 읽어 globalThis 에 반영하고, 브라우저에도 같은 값을 넘긴다.
 *
 * ## 왜 레이아웃에 두나
 * 버전 조회는 비동기라 client component 렌더 도중에는 할 수 없다(`lazy()` 키는 동기 값이다).
 * 레이아웃은 라우트를 렌더/재생성할 때마다 도는 유일한 지점이라, 여기서 한 번 읽어
 * globalThis 에 남겨두면 그 다음 SSR 레이어의 렌더가 그 값을 동기로 집어간다.
 *
 * ## 왜 Suspense 가 아니라 `"use cache"` 인가
 * Suspense 로 감싸면 이 스크립트가 셸 **뒤에** 스트리밍된다. 그러면 브라우저의 MF 런타임이
 * 초기화될 때 값이 아직 없어 버전 없는 폴백 엔트리로 붙는다(실측: 매니페스트 404 + CORS 에러).
 * 캐시하면 스크립트가 셸의 일부가 되어 hydration 보다 반드시 먼저 도착한다.
 *
 * 캐시된 페이지가 옛 버전을 들고 있는 건 **맞는 동작**이다. 그 HTML 은 그 버전으로 만들어졌다.
 * 재배포 웹훅이 같은 태그를 만료시키므로 페이지와 함께 갱신된다.
 *
 * ## 왜 이게 멀티 인스턴스 문제를 푸는가
 * 웹훅은 인스턴스 하나에만 닿는다. 하지만 모든 인스턴스가 같은 `mf-version.json` 을 읽으므로,
 * 웹훅을 못 받은 인스턴스도 캐시 TTL(30초)이 지나면 스스로 새 버전을 발견한다.
 * 신호를 전파하는 대신 **상태를 같은 곳에서 읽는다.**
 *
 * ## 브라우저 쪽
 * 서버가 이 HTML 을 만들 때 쓴 버전을 그대로 심어준다. 브라우저는 그 버전으로 remote 엔트리를
 * 요청하므로, 서버 마크업과 hydrate 하는 코드가 같은 빌드가 된다.
 *
 * 넘기는 값은 버전 문자열이 아니라 **매니페스트 URL** 이다. remote 가 웹 자산을
 * `/v<version>/` 불변 경로로 배포하므로, 이 URL 은 다른 코드를 가리키게 되지 않는다.
 */
export async function RemoteVersionSync() {
  'use cache';
  cacheLife('minutes');
  for (const remote of REMOTE_NAMES) cacheTag(remoteVersionTag(remote));

  const resolved = await Promise.all(
    REMOTE_NAMES.map(async (remote) => {
      const info = await fetchRemoteVersion(remote);
      return [
        remote,
        info
          ? {
              version: info.version,
              entry: `${remoteOrigin(remote)}${info.webEntry}`,
            }
          : null,
      ] as const;
    }),
  );

  const versions = Object.fromEntries(resolved.filter(([, info]) => info));

  return (
    <script
      id="mfa-remote-versions"
      // 값은 remote 가 공표한 hex 해시라 문자열 이스케이프만으로 충분하다
      dangerouslySetInnerHTML={{
        __html: `window.__MFA_REMOTE_VERSIONS__=${JSON.stringify(versions)}`,
      }}
    />
  );
}
