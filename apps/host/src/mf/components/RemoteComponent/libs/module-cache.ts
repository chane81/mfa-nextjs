// 폴더 배럴에는 디렉티브가 없다 — 없으면 이 파일이 RSC 그래프에 남아
// `loader` → `react-dom/client` 로 빌드가 막힌다(known-issues P-1).
'use client';

import type { ComponentType } from 'react';

import type { RemoteModuleId, RemoteName } from '@mfa/contracts/remote';

import { UNVERSIONED } from '../../../config';
import { loadRemoteModule } from '../../../loader';
import { remoteVersion } from '../../../versions';

export type RemoteModulePromise = Promise<{
  default: ComponentType<Record<string, unknown>>;
}>;

/**
 * 적재 promise 캐시. 렌더 바깥에 두어야 렌더마다 다시 적재하지 않는다.
 *
 * 캐시하는 것은 컴포넌트가 아니라 **promise** 다 — 근거: ADR-029.
 */
const modulePromises = new Map<string, RemoteModulePromise>();

/**
 * 적재 캐시 키. **버전이 키에 들어가는 것이 핵심**이라 규칙을 함수로 떼어 둔다 —
 * 빠지면 재배포해도 옛 모듈이 프로세스 수명 내내 고정된다(known-issues A-2 · G-1).
 *
 * 둘째 인자는 같은 버전으로 되돌리는 롤백에서 로더를 반드시 한 번 태우는 탈출구다.
 * 이걸 쓰는 쪽은 `MfWarmup`(nonce) 하나다 — 이름이 같은 `RemoteComponent` 의 `reloadKey`
 * **prop** 은 소비자가 없다(그쪽 주석).
 */
export function remoteCacheKey(id: RemoteModuleId, reloadKey?: string): string {
  const remote = id.split('/')[0] as RemoteName;
  const version = remoteVersion(remote) ?? UNVERSIONED;
  return `${id}@${version}${reloadKey ? `#${reloadKey}` : ''}`;
}

export function remoteModulePromise(
  key: string,
  id: RemoteModuleId,
): RemoteModulePromise {
  const cached = modulePromises.get(key);
  if (cached) return cached;

  const promise = loadRemoteModule(id) as RemoteModulePromise;
  modulePromises.set(key, promise);
  return promise;
}
