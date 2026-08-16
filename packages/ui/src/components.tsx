import type { CSSProperties, ReactNode } from 'react';

import { tokens } from './tokens.js';

export interface PanelProps {
  /** 어느 앱(remote)이 렌더링했는지 시각적으로 표시 */
  origin: string;
  originHue?: number;
  title?: string;
  actions?: ReactNode;
  children: ReactNode;
  style?: CSSProperties;
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
  style,
}: PanelProps) {
  return (
    <section
      style={{
        border: `1px dashed hsl(${originHue} 70% 62% / 0.5)`,
        background: tokens.color.surface,
        borderRadius: tokens.radius.lg,
        padding: tokens.space(5),
        display: 'flex',
        flexDirection: 'column',
        gap: tokens.space(4),
        ...style,
      }}
    >
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: tokens.space(3),
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: tokens.space(2),
          }}
        >
          {title ? (
            <h2 style={{ margin: 0, fontSize: 16, color: tokens.color.text }}>
              {title}
            </h2>
          ) : null}
          <span
            style={{
              fontFamily: tokens.font.mono,
              fontSize: 11,
              letterSpacing: '0.04em',
              color: `hsl(${originHue} 70% 72%)`,
              border: `1px solid hsl(${originHue} 70% 62% / 0.45)`,
              borderRadius: tokens.radius.sm,
              padding: '2px 6px',
            }}
          >
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
  const palette: Record<NonNullable<ButtonProps['variant']>, CSSProperties> = {
    primary: {
      background: tokens.color.accent,
      color: tokens.color.accentText,
      border: 'none',
    },
    ghost: {
      background: 'transparent',
      color: tokens.color.text,
      border: `1px solid ${tokens.color.border}`,
    },
    danger: {
      background: 'transparent',
      color: tokens.color.danger,
      border: `1px solid ${tokens.color.danger}55`,
    },
  };

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      style={{
        ...palette[variant],
        borderRadius: tokens.radius.md,
        padding: '8px 14px',
        fontSize: 13,
        fontWeight: 600,
        fontFamily: tokens.font.body,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.45 : 1,
      }}
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
      style={{
        background: `hsl(${hue} 70% 62% / 0.15)`,
        color: `hsl(${hue} 70% 75%)`,
        borderRadius: 999,
        padding: '2px 10px',
        fontSize: 12,
        fontFamily: tokens.font.mono,
      }}
    >
      {children}
    </span>
  );
}

export function Skeleton({ label }: { label: string }) {
  return (
    <div
      style={{
        border: `1px dashed ${tokens.color.border}`,
        borderRadius: tokens.radius.lg,
        padding: tokens.space(6),
        color: tokens.color.textMuted,
        fontFamily: tokens.font.mono,
        fontSize: 13,
        textAlign: 'center',
      }}
    >
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
    <div
      style={{
        border: `1px solid ${tokens.color.danger}55`,
        background: `${tokens.color.danger}12`,
        borderRadius: tokens.radius.lg,
        padding: tokens.space(5),
        color: tokens.color.text,
        display: 'flex',
        flexDirection: 'column',
        gap: tokens.space(2),
      }}
    >
      <strong style={{ color: tokens.color.danger, fontSize: 14 }}>
        {title}
      </strong>
      {detail ? (
        <code
          style={{
            fontFamily: tokens.font.mono,
            fontSize: 12,
            color: tokens.color.textMuted,
            whiteSpace: 'pre-wrap',
          }}
        >
          {detail}
        </code>
      ) : null}
    </div>
  );
}
