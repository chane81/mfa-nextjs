"use client";

import type { RemoteName } from "@mfa/contracts";

import { RemoteComponent } from "@/mf/RemoteComponent";

/**
 * remote 를 **SSR 레이어에서** 한 번 렌더해 번들 캐시를 데운다.
 *
 * client component 인 게 핵심이다. remote 번들을 평가하는 `server-loader` 인스턴스는
 * client component 를 서버 렌더하는 레이어에 있고, Route Handler(RSC 레이어)에서는
 * 그 인스턴스에 닿을 수 없다. 그래서 warm 은 반드시 이 경로를 통과해야 한다.
 *
 * 여기서 프로퍼티로 콜백을 넘기는 것도 client component 라서 가능하다
 * (server component 에서 넘기면 직렬화 불가로 터진다).
 *
 * `nonce` 는 `lazy()` 캐시를 우회해 로더를 반드시 한 번 태우기 위한 값이다.
 * 없으면 롤백처럼 "이미 본 적 있는 버전"으로 갈 때 로더가 아예 호출되지 않는다.
 */
export function MfWarmup({ remotes, nonce }: { remotes: RemoteName[]; nonce: string }) {
  return (
    <div hidden aria-hidden>
      {remotes.includes("catalog") ? (
        <RemoteComponent
          module="catalog/ProductGrid"
          fallbackLabel="warm: catalog"
          reloadKey={nonce}
          props={{ category: "all", onSelect: () => {} }}
        />
      ) : null}
      {remotes.includes("cart") ? (
        <RemoteComponent
          module="cart/CartBadge"
          fallbackLabel="warm: cart"
          reloadKey={nonce}
          props={{}}
        />
      ) : null}
    </div>
  );
}
