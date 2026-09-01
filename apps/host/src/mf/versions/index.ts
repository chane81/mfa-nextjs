import type { RemoteName } from '@mfa/contracts';

import { injectedEntry } from './browser';
import { announcedVersion } from './server';

/**
 * remote 버전을 묻는 **유일한 창구**.
 *
 * ## 이 폴더의 이름 축은 "누가 준 값인가" 다
 *
 * | 함수                | 누가 준 값인가                       | 어디에 사나                    |
 * | ------------------- | ------------------------------------ | ------------------------------ |
 * | `announcedVersion`  | remote 가 `mf-version.json` 에 공표  | host 서버의 `globalCell`       |
 * | `injectedEntry`     | 서버가 HTML 에 심어줌                | 브라우저의 `window` 전역       |
 * | `remoteVersion`     | — (둘 중 있는 쪽)                    | 렌더 코드가 부르는 것          |
 *
 * 위치(server/browser)로 부르지 않는 이유는 아래 한 줄이 말해준다 — 출처로 부르면
 * 두 항이 같은 모양(`…?.version`)이 되어 무엇을 고르는지가 읽힌다.
 *
 * ## 왜 값이 두 군데 사나
 *
 * 서버가 조회한 결과는 그 프로세스 밖으로 못 나가고, 브라우저는 서버가 이 HTML 을 만들 때
 * 쓴 버전을 그대로 이어받아야 한다(안 그러면 hydrate 하는 코드가 다른 빌드가 된다).
 * 그래서 심어주고, 그래서 둘이다. 렌더 코드가 알아야 할 건 그 사정이 아니라
 * "지금 이 렌더가 가리킬 버전" 하나뿐이라 창구를 여기 둔다 — 24차 전에는 창구가 없어서
 * `RemoteComponent` 가 서버 전용 저장소를 직접 읽었고, 브라우저 렌더가 늘 "버전 모름" 으로
 * 떨어져 remote CSS 를 배포본에 없는 `/style.css` 로 요청했다(known-issues G-1).
 */

/** 서버가 만드는 버전 정보. 이 폴더 밖에서도 쓰므로 여기서 다시 내보낸다. */
export type { RemoteVersion } from './server';

/**
 * **"지금 이 렌더가 가리켜야 하는 remote 버전."**
 *
 * ⚠️ `typeof window` 로 가르지 않는다. 두 값은 **한쪽만 차 있다** — 심어준 값은
 * 브라우저에만, `globalCell` 은 서버에만 있다. 그래서 있는 쪽을 집으면 그만이다.
 *
 * 물으면 오히려 틀린다. `window` 가 있는데 주입은 없는 상태가 실재한다 — jsdom 에서
 * 서버 경로를 렌더하는 테스트가 그렇다. 분기 버전으로 바꾸면 `RemoteComponent.test.tsx`
 * 가 4개 깨진다(실측).
 */
export function remoteVersion(remote: RemoteName): string | null {
  return (
    injectedEntry(remote)?.version ?? announcedVersion(remote)?.version ?? null
  );
}
