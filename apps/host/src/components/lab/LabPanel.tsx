import type { ReactNode } from 'react';

import { tokens } from '@mfa/ui';

import { CatalogSection } from '@/components/CatalogSection';

import { HydrationStamp } from './HydrationStamp';
import { LAB_MODES, type LabMode } from './modes';

interface LabPanelProps {
  mode: LabMode;
  /** 이 마크업을 만든 서버 렌더 시각. 캐시되면 얼어붙는다 = 캐시 증거 */
  renderedAt: string;
  children?: ReactNode;
}

/**
 * SSR / ISR / Cache Components 세 모드를 같은 내용으로 렌더해 비교하는 실험 패널.
 *
 * 세 페이지가 **동일한 remote 컴포넌트**(`catalog/ProductGrid`)를 그린다.
 * 다른 건 라우트 세그먼트 설정뿐이다. 그래야 캐시 동작 차이만 분리해서 볼 수 있다.
 */
export function LabPanel({ mode, renderedAt, children }: LabPanelProps) {
  const spec = LAB_MODES[mode];

  return (
    <>
      <section
        style={{
          border: `1px solid hsl(${spec.hue} 60% 45% / 0.5)`,
          borderRadius: tokens.radius.lg,
          padding: tokens.space(6),
          background: `hsl(${spec.hue} 60% 45% / 0.08)`,
          display: 'flex',
          flexDirection: 'column',
          gap: tokens.space(3),
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            gap: tokens.space(3),
          }}
        >
          <h1 style={{ margin: 0, fontSize: 20 }}>{spec.label}</h1>
          <code style={{ fontSize: 12, color: tokens.color.textMuted }}>
            /lab/{mode}
          </code>
        </div>

        <pre
          style={{
            margin: 0,
            padding: tokens.space(3),
            background: tokens.color.bg,
            borderRadius: tokens.radius.md,
            fontSize: 12,
            overflowX: 'auto',
          }}
        >
          {spec.segmentConfig}
        </pre>

        <dl
          style={{
            margin: 0,
            display: 'grid',
            gridTemplateColumns: 'auto 1fr',
            gap: `${tokens.space(2)} ${tokens.space(4)}`,
            fontSize: 13,
          }}
        >
          <dt style={{ color: tokens.color.textMuted }}>서버 렌더 시각</dt>
          <dd style={{ margin: 0 }}>
            <strong
              data-testid="rendered-at"
              style={{ fontFamily: tokens.font.mono }}
            >
              {renderedAt}
            </strong>
          </dd>

          <dt style={{ color: tokens.color.textMuted }}>브라우저 시각</dt>
          <dd style={{ margin: 0 }}>
            <HydrationStamp />
          </dd>
        </dl>

        <p
          style={{
            margin: 0,
            fontSize: 13,
            lineHeight: 1.7,
            color: tokens.color.textMuted,
          }}
        >
          {spec.expect}
        </p>
      </section>

      {children}

      {/* 세 모드가 같은 remote 를 그린다. 캐시 대상이 remote 마크업인지 확인하는 본체 */}
      <CatalogSection />
    </>
  );
}
