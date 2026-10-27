import type { ReactNode } from 'react';

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
