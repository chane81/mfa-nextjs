import { getLoaderStats, resetLoaderStats } from "@/mf/loader-stats";
import { SSR_REMOTE_ENTRIES } from "@/mf/server-loader";

export const dynamic = "force-dynamic";

/**
 * remote 서버 번들 로더 계측 값을 읽는다.
 *
 * 실험 절차:
 *   1. `DELETE /api/lab/stats` 로 0 으로 리셋
 *   2. 대상 페이지를 N 번 요청
 *   3. `GET /api/lab/stats` 로 fetch/eval 횟수 확인
 *
 * ISR 이 동작하면 캐시 HIT 구간의 요청은 fetch 도 eval 도 0 이어야 한다.
 */
export function GET() {
  return Response.json({
    at: new Date().toISOString(),
    entries: SSR_REMOTE_ENTRIES,
    stats: getLoaderStats(),
  });
}

export function DELETE() {
  resetLoaderStats();
  return Response.json({ ok: true, stats: getLoaderStats() });
}
