'use client';

import { Suspense, lazy, type ComponentType } from 'react';

import {
  MODULE_IDS,
  type RemoteModuleId,
  type RemoteName,
} from '@mfa/contracts/remote';

import { WEB_ENTRIES } from '@/mf/config';
import { RemoteBoundary } from '@/mf/components/RemoteBoundary';
import { remoteCacheKey } from '@/mf/components/RemoteComponent';
import { loadRemoteModule } from '@/mf/loader';

/**
 * 데울 모듈. **`MODULE_IDS` 에서 뽑는다 — 이 파일에 remote 이름도 모듈 이름도 없다.**
 *
 * 한때 remote 별로 어느 모듈을 데울지 손으로 적었다. 그 모듈을 **렌더**했기 때문이다 —
 * 렌더하면 필수 prop 이 있는 모듈(`catalog/ProductDetail` 의 `productId`)은 못 쓰므로
 * 사람이 골라야 했고, 그래서 remote 가 늘 때마다 따라 늘어나는 목록이 하나 더 생겼다.
 *
 * 그런데 warm 은 애초에 렌더가 목적이 아니다. 값이 있는 건 **번들 적재**다 —
 * fetch · 무결성 검사 · `new Function` 평가 · expose 존재 확인까지가 `loadRemoteModule`
 * 안에서 끝나고(`mf/loader/server.ts`), 캐시를 채우는 `markBundleReady` 도 거기서 불린다.
 * 그래서 적재만 하고 `null` 을 그리면 **어느 모듈이든 상관없어진다.**
 *
 * 그러면 고를 이유가 없으니 그냥 첫 번째를 쓴다.
 *
 * ⚠️ 없을 때 **여기서 던지지 않는다.** 이 함수는 `remotes.map` 콜백에서 불리는데 그
 * 자리는 `RemoteBoundary` **바깥**이라, 던지면 remote 하나 때문에 warm 페이지가 통째로
 * 죽는다 — "remote 하나가 죽어도 페이지는 산다" 는 이 저장소의 규약과 반대다.
 * 던지는 자리는 아래 `lazy` 안이고, 거기서 던지면 그 remote 의 경계가 받는다.
 */
function warmTarget(remote: RemoteName): RemoteModuleId | undefined {
  return MODULE_IDS.find((moduleId) => moduleId.startsWith(`${remote}/`));
}

/**
 * `lazy` 를 쓰는 이유는 서스펜스 규약 때문이다 — 같은 프라미스를 재사용해야 React 가
 * 무한히 다시 시도하지 않는다. `RemoteComponent` 의 `lazyCache` 와 같은 이유다.
 *
 * **키 규칙도 같은 것을 쓴다**(`remoteCacheKey`). 캐시가 둘이라 규칙까지 둘이 되면
 * 한쪽에만 버전이 빠지는 식으로 조용히 갈린다 — 실제로 그랬다. 버전이 키에 없으면
 * 재배포 후에도 옛 엔트리가 맞아버려 warm 이 적재를 증명하지 못한다.
 *
 * `nonce` 는 그 위에 하나 더 얹는다. 롤백처럼 "이미 본 적 있는 버전" 으로 갈 때는
 * 버전까지 같아서, 그것만으로는 로더가 아예 호출되지 않는다.
 *
 * ## 그래서 **remote 당 한 칸만** 쓴다
 *
 * 웹훅이 주는 nonce 는 요청마다 유일하다(`api/mf-revalidate` 가 `버전-Date.now()` 로
 * 만든다). 키를 그대로 쌓으면 warm 한 번마다 엔트리가 하나씩 늘고, 축출이 없는 데다
 * host 서버는 장수 프로세스라 영영 줄지 않는다 — `lazy` 가 붙든 payload 까지 같이 남는다.
 *
 * 캐시가 필요한 이유는 "한 렌더 안에서 같은 프라미스를 재사용" 뿐이라 과거 nonce 를
 * 들고 있을 이유가 없다. 그래서 새 nonce 가 오면 그 remote 의 칸을 덮어쓴다.
 * 밀려난 컴포넌트를 이미 렌더 중인 트리는 자기 참조를 계속 들고 있으므로 영향이 없다.
 */
const warmCache = new Map<RemoteName, { key: string; Loader: ComponentType }>();

/**
 * 캐시가 remote 수를 넘지 않는지 **테스트가 본다**.
 *
 * 축출은 코드를 읽어서는 깨진 걸 알기 어렵다 — 키를 하나 바꾸면 조용히 무한 증가로
 * 돌아가고, 증상은 몇 주 뒤 메모리로만 나타난다. 그래서 크기를 관찰 가능하게 둔다.
 */
export const warmCacheSize = (): number => warmCache.size;

export function warmLoader(remote: RemoteName, nonce: string): ComponentType {
  const id = warmTarget(remote);
  const key = id
    ? remoteCacheKey(id, nonce)
    : `${remote}/(노출 모듈 없음)#${nonce}`;

  const cached = warmCache.get(remote);
  if (cached?.key === key) return cached.Loader;

  const Loader = lazy(async () => {
    if (!id) {
      throw new Error(
        `remote '${remote}' 에 노출 모듈이 없습니다. 'pnpm mf:types' 를 돌렸는지 확인하세요.`,
      );
    }
    await loadRemoteModule(id);
    // 적재만 하면 끝이다. 그리지 않으므로 props 도 필요 없다.
    return { default: () => null };
  });
  warmCache.set(remote, { key, Loader });
  return Loader;
}

/**
 * remote 를 **SSR 레이어에서** 적재해 번들 캐시를 데운다.
 *
 * client component 인 게 핵심이다. remote 번들을 평가하는 서버 로더 인스턴스는
 * client component 를 서버 렌더하는 레이어에 있고, Route Handler(RSC 레이어)에서는
 * 그 인스턴스에 닿을 수 없다. 그래서 warm 은 반드시 이 경로를 통과해야 한다.
 */
export function MfWarmup({
  remotes,
  nonce,
}: {
  remotes: RemoteName[];
  nonce: string;
}) {
  return (
    <div hidden aria-hidden>
      {remotes.map((remote) => {
        const Loader = warmLoader(remote, nonce);
        return (
          <RemoteBoundary
            key={remote}
            remoteName={remote}
            entry={WEB_ENTRIES[remote]}
          >
            <Suspense fallback={null}>
              <Loader />
            </Suspense>
          </RemoteBoundary>
        );
      })}
    </div>
  );
}
