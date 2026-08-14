import { REMOTE_NAMES } from "@mfa/contracts";

import { fetchRemoteVersion } from "./remote-version";

/**
 * remote 버전을 새로 읽어 globalThis 에 반영하고, 브라우저에도 같은 값을 넘긴다.
 *
 * ## 왜 레이아웃에 두나
 * 버전 조회는 비동기라 client component 렌더 도중에는 할 수 없다(`lazy()` 키는 동기 값이다).
 * 레이아웃은 라우트를 렌더/재생성할 때마다 도는 유일한 지점이라, 여기서 한 번 읽어
 * globalThis 에 남겨두면 그 다음 SSR 레이어의 렌더가 그 값을 동기로 집어간다.
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
 * 한계: 지금 웹 번들은 버전 경로가 아니라 쿼리(`?v=`)로만 구분된다. 재배포가 파일을
 * 덮어쓰면 옛 버전 URL 이 새 코드를 받는다. 진짜 고정은 remote 가 웹 자산까지
 * 불변 접두사로 배포해야 가능하다(CDN 배포에서 할 일). SSR 번들은 이미 불변 경로다.
 */
export async function RemoteVersionSync() {
  const entries = await Promise.all(
    REMOTE_NAMES.map(async (remote) => [remote, (await fetchRemoteVersion(remote))?.version] as const),
  );

  const versions = Object.fromEntries(entries.filter(([, version]) => version));

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
