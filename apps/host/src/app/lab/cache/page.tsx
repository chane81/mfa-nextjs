import { cacheLife, cacheTag } from 'next/cache';

import { LabPanel } from '@/components/lab/LabPanel';
import { remoteCacheTag } from '@/mf/server-loader';

/**
 * 실험 C — 이벤트 기반 무효화.
 *
 * `/lab/isr` 과 코드는 거의 같고 **수명 정책만** 다르다.
 * 여기서는 시간(60초)이 아니라 태그로 깬다 — remote 재배포처럼
 * "언제 바뀔지 모르지만 바뀌면 즉시"인 무효화가 MFA 에 필요한 바로 그 형태다.
 *
 * 중요: 태그는 **`"use cache"` 스코프 안에서 `cacheTag()` 로** 달아야 한다.
 * fetch 의 `next: { tags }` 옵션은 Data Cache 계층에만 붙고 이 엔트리는 깨지 않는다.
 * (실측: docs/04-experiments/03-cache-modes.md)
 */
async function CachedShell() {
  'use cache';
  cacheLife('minutes');
  cacheTag(remoteCacheTag('catalog'));

  return <LabPanel mode="cache" renderedAt={new Date().toISOString()} />;
}

export default function LabCachePage() {
  return <CachedShell />;
}
