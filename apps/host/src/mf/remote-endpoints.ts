import {
  REMOTE_NAMES,
  ssrBundleUrl,
  webManifestUrl,
  type RemoteName,
} from '@mfa/remote-config';

/**
 * host 가 보는 remote 주소.
 *
 * **이 파일에 remote 이름이 하나도 없다.** 목록은 전부 `@mfa/remote-config` 에서 오고,
 * remote 를 늘리거나 줄일 때 여기는 손대지 않는다.
 *
 * 두 URL 모두 **같은 환경변수 하나**(`REMOTE_*_PUBLIC_URL`)에서 파생된다. 다른 건 오리진
 * 뒤에 붙는 파일명뿐이고, 그 조립은 `@mfa/remote-config` 가 한다. 여기서 경로 문자열을
 * 만들지 않는다.
 *
 * 그런데 **들어오는 경로는 둘로 갈린다.** 노출 범위와 치환 규칙이 다르기 때문이다.
 *
 * ## web 엔트리 — `next.config.ts` 가 구워서 넘긴다
 *
 * 브라우저가 읽어야 하는 값이다. 그런데 Next 는 `process.env.리터럴` 형태만 빌드 타임에
 * 치환하고 동적 접근(`process.env[key]`)은 치환하지 않아 브라우저에서 `undefined` 가 된다.
 * 그래서 **순회는 node 에서 도는 `next.config.ts` 가 하고**, 그 결과를 `env` 로 넘겨
 * 여기서는 리터럴 하나만 읽는다. remote 가 늘어도 이 파일이 읽는 이름은 그대로다.
 *
 * ## SSR 엔트리 — 서버에서 직접 읽는다
 *
 * host **서버**만 쓰는 값이라 브라우저에 노출하지 않는다. 서버에서는 `process.env` 가
 * 진짜 객체라 동적 접근이 그대로 동작한다. 브라우저 번들에서는 값이 없어 기본값으로
 * 떨어지는데, 브라우저가 이 값을 쓰는 경로는 없다 — 서버 로더와 버전 조회 전용이다.
 *
 * 빈 `ARG` 가 빈 문자열로 도착하는 함정(`??` 로 받으면 `new URL("")` 에서 터진다)은
 * `publicOrigin` 안에서 `||` 로 처리한다. 기록: docs/03-setup/04-dokploy.md
 */

function byRemote(
  resolve: (remote: RemoteName) => string,
): Record<RemoteName, string> {
  return REMOTE_NAMES.reduce(
    (acc, remote) => {
      acc[remote] = resolve(remote);
      return acc;
    },
    {} as Record<RemoteName, string>,
  );
}

/**
 * `next.config.ts` 가 구워 넣은 값. 이 모듈이 Next 밖에서 로드되는 경우
 * (tsc, 스크립트 등) 값이 없을 수 있어 파싱 실패는 조용히 기본값으로 떨어뜨린다.
 */
function injectedWebEntries(): Partial<Record<RemoteName, string>> {
  const raw = process.env.MFA_REMOTE_WEB_ENTRIES;
  if (!raw) return {};
  try {
    return JSON.parse(raw) as Partial<Record<RemoteName, string>>;
  } catch {
    return {};
  }
}

const INJECTED_WEB_ENTRIES = injectedWebEntries();

/** 브라우저 MF 런타임이 읽는 매니페스트 URL */
export const WEB_ENTRIES = byRemote(
  (remote) => INJECTED_WEB_ENTRIES[remote] || webManifestUrl(remote),
);

/** host **서버**가 받아 실행하는 node 번들 URL */
export const SSR_ENTRIES = byRemote((remote) => ssrBundleUrl(remote));
