'use client';

import { useEffect, useRef } from 'react';

import { tokens } from '@mfa/ui';

import { formatKst } from '@/lib/format-time';

/**
 * hydration 이후 브라우저 시각을 찍는다.
 *
 * 서버 렌더 시각과 나란히 두면 캐시 상태가 눈으로 보인다.
 * - SSR: 두 시각이 거의 같다
 * - ISR: 서버 시각만 과거에 멈춰 있다 = 캐시 HIT
 *
 * 초기 렌더에서 시각을 읽으면 hydration mismatch 이므로 마운트 후에 채운다.
 * setState 대신 DOM 을 직접 쓴다 — 시각은 React 상태가 아니라 외부 시스템 값이고,
 * effect 안의 setState 는 연쇄 렌더를 부른다(`react-hooks/set-state-in-effect`).
 */
export function HydrationStamp() {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (ref.current) ref.current.textContent = formatKst(new Date());
  }, []);

  return (
    <span
      ref={ref}
      data-testid="hydrated-at"
      style={{ fontFamily: tokens.font.mono, color: tokens.color.textMuted }}
    >
      hydration 대기…
    </span>
  );
}
