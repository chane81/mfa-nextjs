import Link from 'next/link';

import { tokens } from '@mfa/ui';

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
      <section
        style={{
          border: `1px solid ${tokens.color.border}`,
          borderRadius: tokens.radius.lg,
          padding: tokens.space(6),
          background: tokens.color.surface,
        }}
      >
        <h1 style={{ margin: 0, fontSize: 22 }}>
          캐시 실험 — MFA 에서 ISR 이 되는가
        </h1>
        <p
          style={{
            color: tokens.color.textMuted,
            fontSize: 14,
            lineHeight: 1.7,
          }}
        >
          런타임 Module Federation 으로 remote 를 소비할 때 Next.js 의 캐시
          기능이 어디까지 그대로 쓰이는지 실측한다. 세 페이지 모두{' '}
          <code>catalog/ProductGrid</code> 를 렌더하고, 차이는 라우트 세그먼트
          설정뿐이다.
        </p>
        <p
          style={{
            color: tokens.color.textMuted,
            fontSize: 13,
            lineHeight: 1.7,
            margin: 0,
          }}
        >
          판정 기준: <strong>서버 렌더 시각이 얼어붙는가</strong> ·{' '}
          <strong>캐시된 HTML 안에 remote 마크업이 있는가</strong> ·{' '}
          <strong>요청당 remote 번들 fetch 가 0 인가</strong> (
          <Link href="/api/lab/stats" style={{ color: tokens.color.accent }}>
            /api/lab/stats
          </Link>
          )
        </p>
      </section>

      <div style={{ display: 'grid', gap: tokens.space(4) }}>
        {LAB_ORDER.map((mode) => {
          const spec = LAB_MODES[mode];
          return (
            <Link
              key={mode}
              href={`/lab/${mode}`}
              style={{
                textDecoration: 'none',
                color: 'inherit',
                border: `1px solid hsl(${spec.hue} 60% 45% / 0.5)`,
                background: `hsl(${spec.hue} 60% 45% / 0.08)`,
                borderRadius: tokens.radius.lg,
                padding: tokens.space(5),
                display: 'flex',
                flexDirection: 'column',
                gap: tokens.space(2),
              }}
            >
              <strong style={{ fontSize: 16 }}>{spec.label}</strong>
              <code style={{ fontSize: 12, color: tokens.color.textMuted }}>
                {spec.segmentConfig}
              </code>
              <span
                style={{
                  fontSize: 13,
                  lineHeight: 1.6,
                  color: tokens.color.textMuted,
                }}
              >
                {spec.expect}
              </span>
            </Link>
          );
        })}
      </div>
    </>
  );
}
