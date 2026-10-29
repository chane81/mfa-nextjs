/**
 * 실험 패널이 화면에 찍는 시각 포맷.
 *
 * 값 자체는 계속 UTC ISO 로 다룬다(전달·비교·API 응답). 사람이 캐시 HIT 를 눈으로
 * 판정하는 화면에서만 한국 시간 `yyyy-MM-dd HH:mm:ss` 로 바꾼다. UTC 를 그대로 두면
 * 서버 시각과 브라우저 시각을 비교할 때마다 머릿속에서 9시간을 더해야 한다.
 *
 * 서버와 브라우저가 **같은 문자열**을 만들어야 hydration mismatch 가 안 난다. 그래서
 * 실행 환경의 로캘·타임존에 기대지 않는다.
 * - `timeZone` 을 `Asia/Seoul` 로 고정 (컨테이너는 UTC 로 돈다)
 * - `toLocaleString` 대신 파트를 직접 조립 — 로캘에 따라 구분자·순서가 달라진다
 * - `hourCycle: 'h23'` — `hour12: false` 는 ICU 버전에 따라 자정을 24 로 낸다
 */
const KST_FORMAT = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Asia/Seoul',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

export function formatKst(value: Date | string | number): string {
  const parts = Object.fromEntries(
    KST_FORMAT.formatToParts(new Date(value)).map((p) => [p.type, p.value]),
  );

  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`;
}
