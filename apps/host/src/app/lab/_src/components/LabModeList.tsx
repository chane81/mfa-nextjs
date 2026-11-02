import Link from 'next/link';

import { hueVar } from '@mfa/libs/style/hue';

import { LAB_MODES, LAB_ORDER } from '../constants/modes';

/**
 * 실험 세 모드로 가는 카드 목록.
 *
 * 라벨 · 세그먼트 설정 문자열 · 기대 결과는 모두 `constants/modes.ts` 가 들고 있다 —
 * 이 컴포넌트는 그 표를 그리기만 한다. 모드를 늘릴 때 고치는 자리는 그 상수 하나다.
 */
export function LabModeList() {
  return (
    <div className="grid gap-4">
      {LAB_ORDER.map((mode) => {
        const spec = LAB_MODES[mode];
        return (
          <Link
            key={mode}
            href={`/lab/${mode}`}
            // 모드 색(hue)은 `modes.ts` 가 정하는 런타임 값이라 클래스로 굳힐 수 없다
            style={hueVar(spec.hue)}
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
  );
}
