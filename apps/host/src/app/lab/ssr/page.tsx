/**
 * 실험 A — 기준선. remote 를 요청마다 SSR 한다.
 *
 * 지금 host 의 나머지 라우트가 전부 이 모드다.
 */
export const dynamic = "force-dynamic";

import { LabPanel } from "@/components/lab/LabPanel";

export default function LabSsrPage() {
  return <LabPanel mode="ssr" renderedAt={new Date().toISOString()} />;
}
