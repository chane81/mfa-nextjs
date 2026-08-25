import { describe, expect, it } from 'vitest';

import { LAB_MODES, LAB_ORDER, type LabMode } from './modes';

describe('LAB_MODES', () => {
  it('LAB_ORDER 가 LAB_MODES 의 키를 빠짐없이 담는다', () => {
    // 모드를 추가하고 순서에 안 넣으면 화면에서 조용히 사라진다.
    expect([...LAB_ORDER].sort()).toEqual(Object.keys(LAB_MODES).sort());
  });

  it('순서에 중복이 없다', () => {
    expect(new Set(LAB_ORDER).size).toBe(LAB_ORDER.length);
  });

  it('모든 모드가 라벨 · 설정 · 기대 결과를 갖는다', () => {
    for (const mode of LAB_ORDER) {
      const spec = LAB_MODES[mode];
      expect(spec.label.length).toBeGreaterThan(0);
      expect(spec.segmentConfig.length).toBeGreaterThan(0);
      expect(spec.expect.length).toBeGreaterThan(0);
    }
  });

  it('hue 는 CSS 색상환 범위 안에 있다', () => {
    for (const mode of LAB_ORDER) {
      expect(LAB_MODES[mode].hue).toBeGreaterThanOrEqual(0);
      expect(LAB_MODES[mode].hue).toBeLessThan(360);
    }
  });

  it('모드마다 hue 가 다르다 — 화면에서 구분하려고 있는 값이다', () => {
    const hues = LAB_ORDER.map((mode) => LAB_MODES[mode].hue);
    expect(new Set(hues).size).toBe(hues.length);
  });

  it('segmentConfig 는 Next 16 이 버린 세그먼트 설정을 쓰지 않는다', () => {
    // Next 16 은 dynamic / revalidate 세그먼트 설정을 버렸다. 문서용 문자열이지만
    // 여기 남아 있으면 읽는 사람이 그대로 따라 쓴다.
    for (const mode of LAB_ORDER) {
      expect(LAB_MODES[mode].segmentConfig).not.toMatch(
        /export const (dynamic|revalidate)/,
      );
    }
  });

  it('타입과 값이 어긋나지 않는다', () => {
    const known: LabMode[] = ['ssr', 'isr', 'cache'];
    expect([...LAB_ORDER].sort()).toEqual([...known].sort());
  });
});
