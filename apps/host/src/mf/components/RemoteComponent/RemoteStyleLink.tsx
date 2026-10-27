'use client';

import type { RemoteName } from '@mfa/contracts/remote';
import { stylesPath } from '@mfa/remote-config';

import { WEB_ORIGINS } from '../../config';
import { remoteVersion } from '../../versions';

/**
 * remote 의 스타일시트를 host 가 건다. **CSS 는 두 로딩 경로 어디로도 따라오지 않는다** —
 * 브라우저는 MF 런타임이 모듈만 가져오고, 서버는 CJS 문자열을 평가할 뿐이다.
 * remote 소비가 전부 지나가는 이 자리에 두면 누락이 불가능해진다(ADR: docs/02-architecture/05-styling.md).
 *
 * 오리진은 `WEB_ORIGINS` 다 — `publicOrigin()` 은 브라우저에서 `localhost` 로 떨어진다
 * (known-issues C-3). 버전이 없으면 dev 서버가 서빙하는 비버전 경로이고, 그때는 그게 맞다.
 *
 * `precedence` 를 remote 마다 다르게 두지 않는 이유는 host 스타일시트와의 상대 순서가
 * remote 개수·로드 순서에 따라 흔들리지 않게 하기 위해서다.
 *
 * ⚠️ 호출부는 이걸 `Suspense` **밖**에 둔다. 안에 두면 remote 번들을 기다리는 동안
 * 스타일시트 요청이 시작되지 않는다.
 */
export function RemoteStyleLink({ remoteName }: { remoteName: RemoteName }) {
  return (
    <link
      rel="stylesheet"
      href={`${WEB_ORIGINS[remoteName]}${stylesPath(remoteVersion(remoteName))}`}
      precedence="mfa-remote"
    />
  );
}
