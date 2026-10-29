import { describe, expect, it, vi } from 'vitest';

import { checkMfSecret, mfSecretHeader } from './mf-secret';

/**
 * `/api/mf-revalidate`, `/internal/mf-warm`, 그리고 그 앞을 막는 proxy 가 전부 이 함수를 쓴다.
 * 세 곳의 규칙이 어긋나면 한 곳만 열려도 전체가 뚫린다.
 */

const headers = (value?: string) => ({
  get: (name: string) =>
    name === 'x-mf-secret' && value !== undefined ? value : null,
});

describe('checkMfSecret', () => {
  it('시크릿이 설정되지 않았으면 언제나 거부한다', () => {
    // 미설정을 "인증 없음" 으로 해석하면 환경변수를 빠뜨린 배포가
    // 조용히 열린 엔드포인트가 된다. fail-closed 여야 한다.
    vi.stubEnv('MF_REVALIDATE_SECRET', undefined);
    expect(checkMfSecret(headers('무엇이든'))).toBe(false);
    expect(checkMfSecret(headers(''))).toBe(false);
    expect(checkMfSecret(headers())).toBe(false);
  });

  it('빈 문자열 시크릿도 미설정으로 본다', () => {
    // Docker 의 ARG 가 값 없이 선언되면 빈 문자열로 도착한다.
    vi.stubEnv('MF_REVALIDATE_SECRET', '');
    expect(checkMfSecret(headers(''))).toBe(false);
  });

  it('헤더가 없으면 거부한다', () => {
    vi.stubEnv('MF_REVALIDATE_SECRET', 's3cret');
    expect(checkMfSecret(headers())).toBe(false);
  });

  it('값이 다르면 거부한다', () => {
    vi.stubEnv('MF_REVALIDATE_SECRET', 's3cret');
    expect(checkMfSecret(headers('s3cres'))).toBe(false);
  });

  it('길이가 다르면 거부한다', () => {
    vi.stubEnv('MF_REVALIDATE_SECRET', 's3cret');
    expect(checkMfSecret(headers('s3cre'))).toBe(false);
    expect(checkMfSecret(headers('s3crett'))).toBe(false);
  });

  it('접두사가 같아도 거부한다', () => {
    vi.stubEnv('MF_REVALIDATE_SECRET', 's3cret');
    expect(checkMfSecret(headers('s3cret-and-more'))).toBe(false);
  });

  it('정확히 일치하면 통과한다', () => {
    vi.stubEnv('MF_REVALIDATE_SECRET', 's3cret');
    expect(checkMfSecret(headers('s3cret'))).toBe(true);
  });

  it('멀티바이트 시크릿도 다룬다', () => {
    // 상수시간 비교가 문자가 아니라 UTF-8 바이트를 센다.
    vi.stubEnv('MF_REVALIDATE_SECRET', '비밀-🔐');
    expect(checkMfSecret(headers('비밀-🔐'))).toBe(true);
    expect(checkMfSecret(headers('비밀-🔓'))).toBe(false);
  });

  it('글자 수가 같아도 바이트 길이가 다르면 거부한다', () => {
    vi.stubEnv('MF_REVALIDATE_SECRET', 'aaa');
    expect(checkMfSecret(headers('가나다'))).toBe(false);
  });

  it('x-mf-secret 이 아닌 헤더는 보지 않는다', () => {
    vi.stubEnv('MF_REVALIDATE_SECRET', 's3cret');
    expect(checkMfSecret({ get: () => 's3cret' })).toBe(true);
    expect(
      checkMfSecret({
        get: (name) => (name === 'authorization' ? 's3cret' : null),
      }),
    ).toBe(false);
  });

  it('표준 Headers 객체를 그대로 받는다', () => {
    // 덕타이핑으로 선언한 덕에 edge 런타임의 Headers 도 그대로 들어간다.
    vi.stubEnv('MF_REVALIDATE_SECRET', 's3cret');
    expect(checkMfSecret(new Headers({ 'x-mf-secret': 's3cret' }))).toBe(true);
  });
});

describe('mfSecretHeader', () => {
  it('자기 자신을 부를 때 쓰는 헤더를 만든다', () => {
    vi.stubEnv('MF_REVALIDATE_SECRET', 's3cret');
    expect(mfSecretHeader()).toEqual({ 'x-mf-secret': 's3cret' });
  });

  it('시크릿이 없으면 빈 값을 싣는다 — 받는 쪽이 거부한다', () => {
    vi.stubEnv('MF_REVALIDATE_SECRET', undefined);
    expect(mfSecretHeader()).toEqual({ 'x-mf-secret': '' });
  });

  it('만든 헤더가 자기 검사를 통과한다 (왕복)', () => {
    vi.stubEnv('MF_REVALIDATE_SECRET', 's3cret');
    expect(checkMfSecret(new Headers(mfSecretHeader()))).toBe(true);
  });
});
