import { cacheLife, cacheTag } from "next/cache";

import { LabPanel } from "@/components/lab/LabPanel";

/**
 * 실험 C — Cache Components.
 *
 * ISR 등가(/lab/isr)와 다른 점은 **태그**다. `cacheTag` 를 달면 시간이 아니라
 * 이벤트로 캐시를 깰 수 있다. remote 재배포처럼 "언제 바뀔지 모르지만 바뀌면 즉시"인
 * 무효화가 MFA 에서 필요한 바로 그 형태다.
 *
 * 관전 포인트: `"use cache"` 는 RSC 페이로드를 캐시한다. 그런데 remote 는
 * client boundary 안에서 런타임 HTTP 로 로드된다. 이 IO 가 prerender 에서
 * 정적 셸에 흡수되는지, Suspense 구멍으로 떨어져 요청 시 스트리밍되는지를 본다.
 */
async function CachedShell() {
  "use cache";
  cacheLife("minutes");
  cacheTag("lab:cache");

  return <LabPanel mode="cache" renderedAt={new Date().toISOString()} />;
}

export default function LabCachePage() {
  return <CachedShell />;
}
