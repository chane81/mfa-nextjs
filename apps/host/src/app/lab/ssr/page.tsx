import { connection } from 'next/server';
import { Suspense } from 'react';

import { Skeleton } from '@mfa/ui';

import { LabPanel } from '@/components/lab/LabPanel';

/**
 * 실험 A — 요청마다 렌더 (cacheComponents 브랜치 버전).
 *
 * `export const dynamic = "force-dynamic"` 은 cacheComponents 와 공존할 수 없다.
 * 대신 `connection()` 을 await 해서 "이 렌더는 요청에 의존한다"고 선언하고,
 * **반드시 Suspense 안에 둬야 한다.** 밖에 두면 빌드가 막힌다:
 *
 *   Error: Route "/lab/ssr": Next.js encountered uncached or runtime data
 *          during prerendering. (blocking-prerender-dynamic)
 *
 * 즉 cacheComponents 모드에서 "동적"은 라우트 속성이 아니라 **트리 안의 구멍**이다.
 */
async function DynamicPanel() {
  await connection();

  return <LabPanel mode="ssr" renderedAt={new Date().toISOString()} />;
}

export default function LabSsrPage() {
  return (
    <Suspense fallback={<Skeleton label="요청마다 렌더 중…" />}>
      <DynamicPanel />
    </Suspense>
  );
}
