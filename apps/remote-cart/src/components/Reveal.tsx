import type { ReactNode } from 'react';

/**
 * 접힘 ↔ 펼침을 **이어서** 움직이는 상자.
 *
 * ## 왜 그리드인가
 *
 * `height: auto` · `width: auto` 에는 transition 이 안 걸린다. 그리드 한 줄(칸)의
 * `0fr → 1fr` 은 내용 크기를 미리 알 필요가 없는 유일한 방법이다 — 장바구니 줄 수는
 * 서버도, 첫 클라이언트 렌더도 모르므로 크기를 미리 박아 둘 수가 없다(ADR-014).
 *
 * 자식이 `overflow-hidden` 이라야 접히는 동안 내용이 밖으로 삐져나오지 않고,
 * 그리드 항목의 기본 `min-height: auto` 를 0 으로 눌러야 실제로 0 까지 접힌다.
 */
export interface RevealProps {
  open: boolean;
  /** `y` = 높이(패널 목록), `x` = 폭(헤더 배지). 기본은 `y` */
  axis?: 'x' | 'y';
  children: ReactNode;
}

/**
 * 축마다 다른 것만 여기 모은다. 나머지(곡선·시간·불투명도)는 두 축이 공유한다 —
 * 같은 곡선을 타야 배지와 패널이 하나의 동작으로 읽힌다.
 */
const AXIS = {
  y: 'grid grid-rows-[0fr] transition-[grid-template-rows,opacity] data-[open=true]:grid-rows-[1fr] *:min-h-0',
  x: 'inline-grid grid-cols-[0fr] transition-[grid-template-columns,opacity] data-[open=true]:grid-cols-[1fr] *:min-w-0 *:whitespace-nowrap',
} as const;

export function Reveal({ open, axis = 'y', children }: RevealProps) {
  return (
    <div
      data-open={open ? 'true' : 'false'}
      className={`${AXIS[axis]} opacity-0 duration-300 ease-reveal *:overflow-hidden data-[open=true]:opacity-100 motion-reduce:transition-none`}
    >
      <div>{children}</div>
    </div>
  );
}

/**
 * 같은 전환의 나머지 반쪽 — **접히지 않는 자리**를 위한 것.
 *
 * 목록은 접혀도 합계 줄은 남으므로 확정 전 `0개 · 합계 0원` 이 한 프레임 노출된다.
 * 그 자리마다 장치를 하나씩 더 붙이는 대신 상자(패널)를 통째로 흐리게 두고
 * 값이 확정되는 순간 푼다. 값을 감추는 게 아니라 **"아직 확정 전"을 상태로
 * 보여주는 것**이라, 사라졌다 나타나는 대신 초점이 맞는 동작이 의미와도 맞는다.
 *
 * `blur-xs` 는 4px 다(Tailwind v4 스케일). 더 흐리면 상자가 사라진 것처럼 읽히고,
 * 덜하면 `0원` 이 읽혀 버린다.
 */
const SETTLING =
  'transition-[opacity,filter] duration-300 ease-reveal motion-reduce:transition-none';

export function settlingClass(settled: boolean): string {
  return settled ? SETTLING : `${SETTLING} opacity-50 blur-xs`;
}
