import { cacheLife, cacheTag } from 'next/cache';

import { LabPanel } from '@/components/lab/LabPanel';
import { remoteCacheTag } from '@/mf/server-loader';

/**
 * 실험 B — ISR 등가.
 *
 * Next 16 은 `export const revalidate = 60` 을 `"use cache"` + `cacheLife` 로 대체했다.
 * 캐시 단위가 **라우트 전체**에서 **함수 하나**로 내려온 것이 핵심 차이다.
 *
 * 60초는 내장 프로필(`seconds`/`minutes`/…)과 정확히 맞지 않아 커스텀 값으로 준다.
 * 팀 컨벤션이 생기면 next.config 에 커스텀 프로필로 등록하는 편이 낫다.
 */
async function IsrEquivalent() {
  'use cache';
  cacheLife({ stale: 60, revalidate: 60, expire: 3600 });
  // 이 캐시 스코프가 어떤 remote 에 의존하는지 스스로 선언한다.
  // remote 재배포 웹훅은 이 태그만 만료시키면 되고, 라우트 목록을 알 필요가 없다.
  cacheTag(remoteCacheTag('catalog'));

  return <LabPanel mode="isr" renderedAt={new Date().toISOString()} />;
}

export default function LabIsrPage() {
  return <IsrEquivalent />;
}
