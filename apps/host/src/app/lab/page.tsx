import Link from 'next/link';
import type { CSSProperties } from 'react';

import { LAB_MODES, LAB_ORDER } from '@/components/lab/modes';

/**
 * 캐시 실험 인덱스.
 *
 * 세 페이지는 **완전히 같은 트리**를 렌더한다(같은 remote, 같은 패널).
 * 다른 건 라우트 세그먼트 설정 한 줄뿐이라 캐시 동작 차이만 분리해서 관측된다.
 */
export default function LabIndexPage() {
  return (
    <>
      <section className="rounded-lg border border-line bg-surface p-6">
        <h1 className="m-0 text-[22px]">캐시 실험 — MFA 에서 ISR 이 되는가</h1>
        <p className="text-sm leading-[1.7] text-muted">
          런타임 Module Federation 으로 remote 를 소비할 때 Next.js 의 캐시
          기능이 어디까지 그대로 쓰이는지 실측한다. 세 페이지 모두{' '}
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

      <div className="grid gap-4">
        {LAB_ORDER.map((mode) => {
          const spec = LAB_MODES[mode];
          return (
            <Link
              key={mode}
              href={`/lab/${mode}`}
              // 모드 색(hue)은 `modes.ts` 가 정하는 런타임 값이라 클래스로 굳힐 수 없다
              style={{ '--hue': spec.hue } as CSSProperties}
              className="flex flex-col gap-2 rounded-lg border border-[hsl(var(--hue)_60%_45%/0.5)] bg-[hsl(var(--hue)_60%_45%/0.08)] p-5 text-inherit no-underline"
            >
              <strong className="text-base">{spec.label}</strong>
              <code className="text-xs text-muted">{spec.segmentConfig}</code>
              <span className="text-[13px] leading-relaxed text-muted">
                {spec.expect}
              </span>
            </Link>
          );
        })}
      </div>
    </>
  );
}
