import type { RemoteName } from '@mfa/contracts';

/**
 * remote 버전 — **브라우저 전용**. 서버가 심어준 값을 읽는 자리.
 *
 * ## 왜 브라우저에는 따로 심어줘야 하나
 *
 * host 서버가 조회한 remote 버전은 `remote-version.ts` 의 `globalCell` 에 남는다.
 * 그건 **서버 프로세스의 globalThis** 라 브라우저 번들에서는 언제나 비어 있다.
 * 그래서 `RemoteVersionSync` 가 서버가 이 HTML 을 만들 때 쓴 값을 인라인 스크립트로
 * 심고, 브라우저는 그 값을 읽는다.
 *
 * ## 왜 이 파일이 따로 있나
 *
 * 원래 이 읽기는 `runtime.ts` 안에 있었고, 그래서 **MF 엔트리 URL 만** 버전을 알았다.
 * 같은 버전이 필요한 다른 소비처(`RemoteComponent` 의 remote CSS 주소와 lazy 캐시 키)는
 * 서버 전용인 공표 버전을 읽어서, 브라우저에서는 늘 "버전 모름" 으로 떨어졌다.
 * 지금은 `./index` 의 `remoteVersion` 이 둘을 합쳐 한 함수로 내보낸다.
 *
 * 증상: 배포본에서 remote CSS 가 `/style.css` 로 요청돼 404. SSR 이 HTML 에 박은
 * `/v<version>/style.css` 는 200 이라 화면은 안 깨지고, `<link>` 만 하나 더 생긴다
 * (href 가 다르니 React 19 의 `precedence` 중복 제거가 안 걸린다).
 *
 * 읽는 곳이 둘 이상이 된 순간 `runtime.ts` 는 자리가 아니다 — 거기서 import 하면
 * `./server` → `runtime.ts` 순환이 생긴다(`runtime` 은 `server-loader` 를, `server-loader` 는
 * `./server` 를 import 한다). 이 파일은 **아무것도 import 하지 않는 잎**이라 그 문제가 없다.
 * 전역 이름도 여기 한 곳에만 있다.
 */

/**
 * 인라인 스크립트가 쓰는 전역 이름. **심는 쪽(`RemoteVersionSync`)과 읽는 쪽이
 * 같은 상수를 본다** — 문자열로 두 번 적으면 어긋났을 때 조용히 폴백으로 떨어진다.
 */
export const REMOTE_VERSIONS_GLOBAL = '__MFA_REMOTE_VERSIONS__';

export interface InjectedEntry {
  version: string;
  /** 브라우저 MF 런타임이 읽는 매니페스트의 **절대 URL** */
  entry: string;
}

/**
 * 서버가 심어준 값 하나. 없으면 `undefined` — 폴백 판단은 부르는 쪽이 한다.
 *
 * 버전만 필요하면 `injectedEntry(remote)?.version` 이다. 그 한 줄짜리 래퍼를 따로 두지
 * 않는다 — 같은 값에 이름이 둘이 되고, 합치는 쪽(`./index`)에서 대칭이 깨진다.
 */
export function injectedEntry(remote: RemoteName): InjectedEntry | undefined {
  return (
    globalThis as { __MFA_REMOTE_VERSIONS__?: Record<string, InjectedEntry> }
  )[REMOTE_VERSIONS_GLOBAL]?.[remote];
}
