import {
  REMOTES,
  REMOTE_NAMES,
  defaultSsrEntry,
  defaultWebEntry,
  type RemoteName,
} from '@mfa/remote-config';

/**
 * host 가 보는 remote 주소.
 *
 * **이 파일에 remote 이름이 하나도 없다.** 목록은 전부 `@mfa/remote-config` 에서 오고,
 * remote 를 늘리거나 줄일 때 여기는 손대지 않는다.
 *
 * 두 값이 서로 다른 경로로 들어오는데, 이유는 노출 범위와 치환 규칙이 다르기 때문이다.
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
 * ## `??` 가 아니라 `||` 인 이유
 *
 * Dockerfile 에서 `ARG` 를 값 없이 선언하면 컨테이너 안에서 **빈 문자열**로 도착한다.
 * `??` 는 빈 값을 유효한 설정으로 받아 `new URL("")` 에서 터진다.
 * (같은 함정 기록: docs/03-setup/04-dokploy.md)
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
  (remote) => INJECTED_WEB_ENTRIES[remote] || defaultWebEntry(remote),
);

/** host **서버**가 받아 실행하는 node 번들 URL */
export const SSR_ENTRIES = byRemote(
  (remote) =>
    process.env[REMOTES[remote].env.ssrEntry] || defaultSsrEntry(remote),
);
