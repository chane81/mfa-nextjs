/**
 * 실험 B — ISR. 60초 주기로 재생성한다.
 *
 * 확인하려는 것: **client boundary 안에서 런타임 로드되는 remote 의 마크업이
 * Full Route Cache 의 HTML 에 실제로 들어가는가.**
 *
 * 들어간다면 remote 번들 fetch + `new Function` 평가가 요청당이 아니라
 * 재생성 주기당 1회로 줄어든다. 이 아키텍처에서 가장 비싼 구간이라 이득이 크다.
 */
export const revalidate = 60;

import { LabPanel } from "@/components/lab/LabPanel";

export default function LabIsrPage() {
  return <LabPanel mode="isr" renderedAt={new Date().toISOString()} />;
}
