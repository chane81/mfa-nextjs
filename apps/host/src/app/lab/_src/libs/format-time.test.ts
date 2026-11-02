import { describe, expect, it, vi } from 'vitest';

import { formatKst } from './format-time';

/**
 * 서버와 브라우저가 **같은 문자열**을 만들어야 hydration mismatch 가 안 난다.
 * 그래서 여기서 지키는 건 "값이 맞다" 보다 "환경에 안 흔들린다" 쪽이다.
 */

// 2026-01-02 03:04:05 UTC → KST 로는 같은 날 12:04:05
const UTC = '2026-01-02T03:04:05.000Z';

describe('formatKst', () => {
  it('yyyy-MM-dd HH:mm:ss 형식이다', () => {
    expect(formatKst(UTC)).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  });

  it('UTC 를 KST(+9) 로 옮긴다', () => {
    expect(formatKst(UTC)).toBe('2026-01-02 12:04:05');
  });

  it('Date · ISO 문자열 · epoch 를 모두 같은 값으로 본다', () => {
    const epoch = Date.parse(UTC);
    expect(formatKst(new Date(UTC))).toBe(formatKst(UTC));
    expect(formatKst(epoch)).toBe(formatKst(UTC));
  });

  it('날짜를 넘기는 시각도 옳게 넘긴다', () => {
    // 15:00 UTC 는 KST 로 다음 날 00:00 이다.
    expect(formatKst('2026-01-01T15:00:00.000Z')).toBe('2026-01-02 00:00:00');
  });

  it('자정을 24 가 아니라 00 으로 낸다', () => {
    // hour12: false 는 ICU 버전에 따라 자정을 24 로 낸다. hourCycle: 'h23' 이 그걸 막는다.
    expect(formatKst('2026-01-01T15:00:00.000Z').slice(11, 13)).toBe('00');
  });

  it('한 자리 값에 0 을 채운다', () => {
    // 2026-03-04 00:05:06 KST = 2026-03-03 15:05:06 UTC
    expect(formatKst('2026-03-03T15:05:06.000Z')).toBe('2026-03-04 00:05:06');
  });

  it('밀리초는 버린다', () => {
    expect(formatKst('2026-01-02T03:04:05.999Z')).toBe(
      formatKst('2026-01-02T03:04:05.000Z'),
    );
  });
});

describe('실행 환경에 기대지 않는다', () => {
  /**
   * ⚠️ `process.env.TZ = original` 로 되돌리면 안 된다. 이 기계처럼 TZ 가 애초에
   * 안 잡혀 있으면 `original` 이 `undefined` 이고, node 는 env 값을 문자열로 강제해
   * **`"undefined"` 라는 값을 심는다** — 그때부터 이 워커의 프로세스 타임존이 UTC 로
   * 굳어 뒤에 도는 테스트까지 끌고 간다.
   *
   * `vi.stubEnv` 는 원래 값이 `undefined` 면 복원 시 **키를 지운다**.
   * `vitest.config.ts` 의 `unstubEnvs: true` 가 매 테스트 앞에서 그걸 돌린다.
   */
  it('프로세스 타임존이 무엇이든 같은 문자열을 만든다', async () => {
    // 컨테이너는 UTC 로 돌고 개발자 기계는 대개 KST 다. 여기가 갈리면
    // 서버 HTML 과 하이드레이션 결과가 달라진다.
    const seen = new Set<string>();

    for (const tz of [
      'UTC',
      'America/New_York',
      'Asia/Seoul',
      'Pacific/Kiritimati',
    ]) {
      vi.stubEnv('TZ', tz);
      vi.resetModules();
      const { formatKst: fresh } = await import('./format-time');
      seen.add(fresh(UTC));
    }

    expect([...seen]).toEqual(['2026-01-02 12:04:05']);
  });

  it('로캘 구분자를 쓰지 않는다', () => {
    // toLocaleString 대신 파트를 직접 조립하는 이유다 — 로캘마다 순서·구분자가 다르다.
    expect(formatKst(UTC)).not.toMatch(/[/,]/);
  });
});
