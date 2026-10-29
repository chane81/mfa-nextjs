import type { ReactNode } from 'react';

import { hueVar } from '@mfa/libs/style/hue';

export interface PanelProps {
  /** 어느 앱(remote)이 렌더링했는지 시각적으로 표시 */
  origin: string;
  originHue?: number;
  title?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}

/**
 * remote 경계를 눈에 보이게 감싸는 컨테이너.
 * MFA 실험에서 "이 UI 는 어느 앱이 그렸나"를 즉시 판별하려는 용도.
 */
export function Panel({
  origin,
  originHue = 210,
  title,
  actions,
  children,
  className = '',
}: PanelProps) {
  return (
    <section
      style={hueVar(originHue)}
      className={`flex flex-col gap-4 rounded-lg bg-surface p-5 remote-boundary ${className}`}
    >
      {/*
        높이는 고정이 아니라 **최소값**이다. 좁은 컬럼(홈의 장바구니 열은 280px 다)에서는
        제목 + origin 라벨 + actions 가 한 줄에 안 들어간다. 고정 높이 + `nowrap` 이면
        글자가 상자 밖으로 넘치고, `whitespace-nowrap` 이 없으면 라벨과 버튼 **안쪽**이
        쪼개져 "비우/기" 처럼 끊긴다(실측). 줄바꿈은 요소 단위로만 일어나게 두고
        높이는 필요한 만큼 늘어나게 한다 — 넓은 화면에서는 36px 그대로다.
      */}
      <header className="flex min-h-9 flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {title ? (
            <h2 className="m-0 text-base whitespace-nowrap text-text">
              {title}
            </h2>
          ) : null}
          <span className="rounded-sm border border-origin px-1.5 py-0.5 font-mono text-[11px] tracking-[0.04em] whitespace-nowrap text-origin">
            {origin}
          </span>
        </div>
        {actions}
      </header>
      {children}
    </section>
  );
}
