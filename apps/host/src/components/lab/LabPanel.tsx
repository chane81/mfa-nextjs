import type { CSSProperties, ReactNode } from 'react';

import { CatalogSection } from '@/components/CatalogSection';
import { formatKst } from '@/lib/format-time';

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
        // 모드 색(hue)은 `modes.ts` 가 정하는 런타임 값이라 클래스로 굳힐 수 없다
        style={{ '--hue': spec.hue } as CSSProperties}
        className="flex flex-col gap-3 rounded-lg border border-[hsl(var(--hue)_60%_45%/0.5)] bg-[hsl(var(--hue)_60%_45%/0.08)] p-6"
      >
        <div className="flex items-baseline gap-3">
          <h1 className="m-0 text-xl">{spec.label}</h1>
          <code className="text-xs text-muted">/lab/{mode}</code>
        </div>

        <pre className="m-0 overflow-x-auto rounded-md bg-bg p-3 text-xs">
          {spec.segmentConfig}
        </pre>

        <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-[13px]">
          <dt className="text-muted">서버 렌더 시각 (KST)</dt>
          <dd className="m-0">
            {/* 화면은 KST, `dateTime` 은 원본 UTC — 값 자체는 ISO 로 남긴다 */}
            <time
              dateTime={renderedAt}
              data-testid="rendered-at"
              className="font-mono font-bold"
            >
              {formatKst(renderedAt)}
            </time>
          </dd>

          <dt className="text-muted">브라우저 시각 (KST)</dt>
          <dd className="m-0">
            <HydrationStamp />
          </dd>
        </dl>

        <p className="m-0 text-[13px] leading-[1.7] text-muted">
          {spec.expect}
        </p>
      </section>

      {children}

      {/* 세 모드가 같은 remote 를 그린다. 캐시 대상이 remote 마크업인지 확인하는 본체 */}
      <CatalogSection />
    </>
  );
}
