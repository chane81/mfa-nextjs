import {
  REMOTE_NAMES,
  ssrBundleUrl,
  webManifestUrl,
  type RemoteName,
} from '@mfa/remote-config';

/**
 * host 가 보는 remote 접근 설정 — **주소와 호출 예산**.
 *
 * **이 파일에 remote 이름이 하나도 없다.** 목록은 전부 `@mfa/remote-config` 에서 오고,
 * remote 를 늘리거나 줄일 때 여기는 손대지 않는다.
 *
 * 두 URL 모두 **같은 환경변수 하나**(`REMOTE_*_PUBLIC_URL`)에서 파생된다. 다른 건 오리진
 * 뒤에 붙는 파일명뿐이고, 그 조립은 `@mfa/remote-config` 가 한다. 여기서 경로 문자열을
 * 만들지 않는다.
 *
 * 이름은 **web / ssr 두 축**으로 갈린다. 같은 remote 를 가리키지만 값이 어디서 유효한지가
 * 다르기 때문이다 — 아래 두 절이 그 이유다.
 *
 * | 이름          | 어디서 유효한가        | 무엇을 가리키나              |
 * | ------------- | ---------------------- | ---------------------------- |
 * | `WEB_ENTRIES` | 브라우저 · 서버 둘 다  | MF 웹 매니페스트 URL         |
 * | `WEB_ORIGINS` | 브라우저 · 서버 둘 다  | 그 매니페스트의 오리진       |
 * | `SSR_ENTRIES` | **host 서버 전용**     | node 타깃 CJS 번들 URL       |
 * | `ssrOrigin()` | **host 서버 전용**     | 그 번들의 오리진             |
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

/** remote 이름 → 값 표를 만든다. 순회는 `REMOTE_NAMES` 가 정한다 */
export function byRemote(
  resolve: (remote: RemoteName) => string,
): Record<RemoteName, string> {
  return Object.fromEntries(
    REMOTE_NAMES.map((remote) => [remote, resolve(remote)]),
  ) as Record<RemoteName, string>;
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

/**
 * remote 오리진. **브라우저에서도 맞는 값이다.**
 *
 * `ssrOrigin()` 과 값은 같지만 출처가 다르다. 그쪽은 `SSR_ENTRIES` 에서 뽑으므로
 * 위의 설명대로 **서버 전용**이다 — 브라우저 번들에서는 `publicOrigin` 이 치환되지 않아
 * 언제나 `localhost` 로 떨어진다.
 *
 * 여기는 `WEB_ENTRIES` 에서 뽑는다. 그 값은 `next.config.ts` 가 node 에서 꺼내 번들에
 * 구워 넣은 것이라 브라우저에서도 배포된 오리진을 정확히 가리킨다. 서버 렌더와 값이
 * 같으므로 하이드레이션도 어긋나지 않는다.
 *
 * 쓰는 곳: `RemoteComponent` 가 remote 스타일시트 주소를 만들 때
 * (`stylesPath` 와 합쳐서). 그쪽 주석에 근거가 있다.
 */
export const WEB_ORIGINS = byRemote(
  (remote) => new URL(WEB_ENTRIES[remote]).origin,
);

/**
 * remote 오리진 — **서버 전용**. 버전 매니페스트와 `/v<version>/` 경로를 여기에 붙인다.
 *
 * 브라우저에서 부르면 `localhost` 로 떨어진다. 브라우저에 나가는 값이 필요하면
 * `WEB_ORIGINS` 다.
 */
export function ssrOrigin(remote: RemoteName): string {
  return new URL(SSR_ENTRIES[remote]).origin;
}

/**
 * remote 응답 제한 시간 (ms).
 *
 * 연결 거부는 즉시 터지지만 **연결된 채 응답을 안 끝내는** remote 는 다르다 —
 * 배포 중이거나, 디스크가 찼거나, 중간 프록시가 먹은 경우다. host 서버는 프로세스
 * 하나라, 매달린 요청이 쌓이면 remote 하나가 host 전체를 끌어내린다. 그건 이 저장소가
 * 내건 독립 장애 격리와 정면으로 어긋난다.
 *
 * 헤더만 받고 끝나는 게 아니라 **본문을 다 받을 때까지**의 예산이다.
 * `fetch` 는 헤더가 오면 resolve 되므로, 실제로 매달리는 자리는 본문 읽기다.
 *
 * 쓰는 곳: 버전 매니페스트(`versions/server.ts`), SSR 번들(`loader/server.ts`).
 */
export const REMOTE_FETCH_TIMEOUT_MS = 10_000;
