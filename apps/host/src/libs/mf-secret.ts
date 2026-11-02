/**
 * remote 배포 파이프라인용 공유 시크릿 검사.
 *
 * `/api/mf-revalidate`, `/internal/mf-warm`, 그리고 그 앞을 막는 proxy 가
 * 모두 이 함수를 쓴다. 세 곳의 규칙이 어긋나면 한 곳만 열려도 전체가 뚫린다.
 *
 * 시크릿이 설정되지 않았으면 **항상 거부**한다. 미설정을 "인증 없음"으로 해석하면
 * 환경변수를 빠뜨린 배포가 조용히 열린 엔드포인트가 된다.
 *
 * `node:crypto` 의 `timingSafeEqual` 대신 직접 상수시간 비교를 한다.
 * proxy 는 edge 런타임에서도 돌 수 있어 node builtin 을 못 쓰기 때문이다.
 */
function constantTimeEqual(a: string, b: string): boolean {
  const encoder = new TextEncoder();
  const x = encoder.encode(a);
  const y = encoder.encode(b);
  // 길이는 노출된다. 문자열 비교가 한 글자씩 흘리는 것보다는 낫다.
  if (x.length !== y.length) return false;

  let diff = 0;
  for (let i = 0; i < x.length; i += 1) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

export function checkMfSecret(headers: {
  get(name: string): string | null;
}): boolean {
  const expected = process.env.MF_REVALIDATE_SECRET;
  if (!expected) return false;

  const provided = headers.get('x-mf-secret');
  if (!provided) return false;

  return constantTimeEqual(provided, expected);
}

/** warm 요청이 자기 자신을 부를 때 붙이는 헤더 */
export function mfSecretHeader(): Record<string, string> {
  return { 'x-mf-secret': process.env.MF_REVALIDATE_SECRET ?? '' };
}
