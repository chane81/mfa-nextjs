import type { CSSProperties, ReactNode } from 'react';

/**
 * host / remote 가 공유하는 프리미티브.
 *
 * 스타일은 Tailwind 클래스로 적는다. **이 패키지는 CSS 를 만들지 않는다** — 클래스 이름만
 * 내보내고, 실제 CSS 는 이 패키지를 쓰는 앱이 자기 파이프라인에서 컴파일한다.
 * `@mfa/tailwind-config` 의 `@source '../ui/src'` 가 그 스캔을 걸어 둔다.
 *
 * 공유 패키지가 CSS 까지 빌드해 배포하면 그 산출물이 새 배포 단위가 되고, 앱이 새 클래스를
 * 쓸 때마다 그걸 먼저 배포해야 한다. MFA 의 독립 배포와 정면으로 어긋난다.
 */

/**
 * remote 마다 다른 경계 색을 넘기는 통로.
 *
 * `originHue` 는 런타임 값이라 클래스로 굳힐 수 없다. CSS 변수로 내려보내고
 * `remote-boundary` / `text-origin` 같은 유틸리티가 그 변수를 읽는다
 * (정의: `packages/tailwind-config/theme.css`).
 */
function hueVar(hue: number): CSSProperties {
  return { '--hue': hue } as CSSProperties;
}

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
      className={`remote-boundary flex flex-col gap-4 rounded-lg bg-surface p-5 ${className}`}
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
          <span className="text-origin border-origin rounded-sm border px-1.5 py-0.5 font-mono text-[11px] tracking-[0.04em] whitespace-nowrap">
            {origin}
          </span>
        </div>
        {actions}
      </header>
      {children}
    </section>
  );
}

export interface ButtonProps {
  onClick?: () => void;
  children: ReactNode;
  variant?: 'primary' | 'ghost' | 'danger';
  disabled?: boolean;
  type?: 'button' | 'submit';
}

export function Button({
  onClick,
  children,
  variant = 'primary',
  disabled = false,
  type = 'button',
}: ButtonProps) {
  /**
   * ⚠️ 클래스 문자열은 **완성된 형태로** 적는다. `bg-${variant}` 처럼 조립하면
   * Tailwind 의 소스 스캔이 그 클래스를 못 찾아 CSS 에서 조용히 빠진다.
   */
  const palette: Record<NonNullable<ButtonProps['variant']>, string> = {
    primary: 'bg-accent text-accent-text border-none',
    ghost: 'bg-transparent text-text border border-line',
    danger: 'bg-transparent text-danger border border-danger/35',
  };

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`${palette[variant]} cursor-pointer rounded-md px-3.5 py-2 font-sans text-[13px] font-semibold whitespace-nowrap disabled:cursor-not-allowed disabled:opacity-45`}
    >
      {children}
    </button>
  );
}

export function Badge({
  children,
  hue = 210,
}: {
  children: ReactNode;
  hue?: number;
}) {
  return (
    <span
      style={hueVar(hue)}
      // pill 안에서 줄바꿈되면 알약 모양이 무너진다. 넘칠 자리는 부모가 wrap 으로 만든다
      className="bg-origin-soft text-origin rounded-full px-2.5 py-0.5 font-mono text-xs whitespace-nowrap"
    >
      {children}
    </span>
  );
}

export function Skeleton({ label }: { label: string }) {
  return (
    <div className="rounded-lg border border-dashed border-line p-6 text-center font-mono text-[13px] text-muted">
      {label}
    </div>
  );
}

export function ErrorBox({
  title,
  detail,
}: {
  title: string;
  detail?: string;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-danger/35 bg-danger/7 p-5 text-text">
      <strong className="text-sm text-danger">{title}</strong>
      {detail ? (
        <code className="font-mono text-xs whitespace-pre-wrap text-muted">
          {detail}
        </code>
      ) : null}
    </div>
  );
}
