import { cacheLife, cacheTag } from 'next/cache';

import { REMOTE_NAMES } from '@mfa/contracts';

import { ssrOrigin } from '../config';
import { injectionScript, type InjectedEntry } from '../versions/browser';
import { fetchRemoteVersion, remoteVersionTag } from '../versions/server';

/**
 * remote 버전을 새로 읽어 globalThis 에 반영하고, 브라우저에도 같은 값을 심어준다.
 * 서버 마크업과 hydrate 하는 코드가 같은 빌드가 되게 하는 장치다.
 *
 * **레이아웃에 둔다** — 버전 조회는 비동기라 client component 렌더 도중에는 할 수 없고,
 * 레이아웃은 라우트를 렌더할 때마다 도는 유일한 지점이다.
 *
 * **`Suspense` 가 아니라 `"use cache"` 다.** Suspense 로 감싸면 스크립트가 셸 뒤에
 * 스트리밍되어 MF 런타임 초기화 때 값이 없다(실측: 매니페스트 404 + CORS).
 * 캐시된 페이지가 옛 버전을 들고 있는 건 맞는 동작이다 — 그 HTML 은 그 버전으로 만들어졌고,
 * 재배포 웹훅이 같은 태그를 만료시킨다. 근거: docs/02-architecture/04-remote-lifecycle.md.
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
          ? ({
              version: info.version,
              entry: `${ssrOrigin(remote)}${info.webEntry}`,
            } satisfies InjectedEntry)
          : null,
      ] as const;
    }),
  );

  const versions = Object.fromEntries(resolved.filter(([, info]) => info));

  return (
    <script
      id="mfa-remote-versions"
      // 전역 이름 · 값 모양 · 이스케이프는 전부 `versions/browser` 가 쥔다 — 읽는 쪽과 같은 파일이다
      dangerouslySetInnerHTML={{ __html: injectionScript(versions) }}
    />
  );
}
