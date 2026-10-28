import type { ReactNode } from 'react';

import { hueVar } from '@mfa/utils/style/hue';

export interface BadgeProps {
  children: ReactNode;
  hue?: number;
}

export function Badge({ children, hue = 210 }: BadgeProps) {
  return (
    <span
      style={hueVar(hue)}
      // pill 안에서 줄바꿈되면 알약 모양이 무너진다. 넘칠 자리는 부모가 wrap 으로 만든다
      className="rounded-full bg-origin-soft px-2.5 py-0.5 font-mono text-xs whitespace-nowrap text-origin"
    >
      {children}
    </span>
  );
}
