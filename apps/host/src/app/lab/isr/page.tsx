import { cacheLife } from "next/cache";

import { LabPanel } from "@/components/lab/LabPanel";

/**
 * 실험 B — ISR 등가 (cacheComponents 브랜치 버전).
 *
 * `export const revalidate = 60` 은 cacheComponents 와 공존할 수 없다.
 * 같은 의미를 `"use cache"` + `cacheLife({ revalidate: 60 })` 로 표현한다.
 * 캐시 단위가 **라우트 전체**에서 **함수 하나**로 내려온 것이 핵심 차이다.
 */
async function IsrEquivalent() {
  "use cache";
  cacheLife({ stale: 60, revalidate: 60, expire: 3600 });

  return <LabPanel mode="isr" renderedAt={new Date().toISOString()} />;
}

export default function LabIsrPage() {
  return <IsrEquivalent />;
}
