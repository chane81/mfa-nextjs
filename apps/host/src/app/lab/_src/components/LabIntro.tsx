import Link from 'next/link';

/**
 * 캐시 실험 인덱스의 머리 섹션 — 무엇을 재고 무엇으로 판정하는지 적는다.
 *
 * 판정 기준이 여기 적힌 셋과 `docs/04-experiments/03-cache-modes.md` 의 실측 표가
 * 짝이다. 기준을 고치면 그쪽도 같이 고친다.
 */
export function LabIntro() {
  return (
    <section className="rounded-lg border border-line bg-surface p-6">
      <h1 className="m-0 text-[22px]">캐시 실험 — MFA 에서 ISR 이 되는가</h1>
      <p className="text-sm leading-[1.7] text-muted">
        런타임 Module Federation 으로 remote 를 소비할 때 Next.js 의 캐시 기능이
        어디까지 그대로 쓰이는지 실측한다. 세 페이지 모두{' '}
        <code>catalog/ProductGrid</code> 를 렌더하고, 차이는 라우트 세그먼트
        설정뿐이다.
      </p>
      <p className="m-0 text-[13px] leading-[1.7] text-muted">
        판정 기준: <strong>서버 렌더 시각이 얼어붙는가</strong> ·{' '}
        <strong>캐시된 HTML 안에 remote 마크업이 있는가</strong> ·{' '}
        <strong>요청당 remote 번들 fetch 가 0 인가</strong> (
        <Link href="/api/lab/stats" className="text-accent">
          /api/lab/stats
        </Link>
        )
      </p>
    </section>
  );
}
