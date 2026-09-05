'use client';

import { Suspense, lazy, type ComponentType } from 'react';

import {
  MODULE_IDS,
  type RemoteModuleId,
  type RemoteName,
} from '@mfa/contracts/remote';

import { WEB_ENTRIES } from '@/mf/config';
import { RemoteBoundary } from '@/mf/components/RemoteBoundary';
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
 */
function warmTarget(remote: RemoteName): RemoteModuleId {
  const id = MODULE_IDS.find((moduleId) => moduleId.startsWith(`${remote}/`));
  if (!id) {
    throw new Error(
      `remote '${remote}' 에 노출 모듈이 없습니다. 'pnpm mf:types' 를 돌렸는지 확인하세요.`,
    );
  }
  return id;
}

/**
 * `lazy` 를 쓰는 이유는 서스펜스 규약 때문이다 — 같은 프라미스를 재사용해야 React 가
 * 무한히 다시 시도하지 않는다. `RemoteComponent` 의 `lazyCache` 와 같은 이유다.
 *
 * 키에 `nonce` 가 들어가는 것도 같다. 없으면 롤백처럼 "이미 본 적 있는 버전" 으로 갈 때
 * 로더가 아예 호출되지 않아 warm 이 아무것도 증명하지 못한다.
 */
const warmCache = new Map<string, ComponentType>();

function warmLoader(id: RemoteModuleId, nonce: string): ComponentType {
  const key = `${id}#${nonce}`;
  const cached = warmCache.get(key);
  if (cached) return cached;

  const Loader = lazy(async () => {
    await loadRemoteModule(id);
    // 적재만 하면 끝이다. 그리지 않으므로 props 도 필요 없다.
    return { default: () => null };
  });
  warmCache.set(key, Loader);
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
        const Loader = warmLoader(warmTarget(remote), nonce);
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
