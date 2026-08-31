import type { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { config, proxy } from './proxy';

/**
 * `/internal/*` 은 배포 파이프라인 전용이다. 페이지 안에서 `notFound()` 를 불러도
 * **상태 코드가 200 으로 나간다** — 그 시점에는 루트 레이아웃이 이미 flush 되기 시작해
 * 응답 헤더가 확정된 뒤다. proxy 는 렌더 파이프라인 앞이라 진짜 404 를 낼 수 있다.
 */
const request = (
  secret?: string,
  { pathname = '/internal/mf-warm', method = 'GET' } = {},
) =>
  ({
    headers: new Headers(secret === undefined ? {} : { 'x-mf-secret': secret }),
    nextUrl: { pathname },
    method,
  }) as NextRequest;

/** 계측 라우트. 시크릿과 무관하게 판정되므로 헤더는 안 붙인다. */
const lab = (method: string) =>
  request(undefined, { pathname: '/api/lab/stats', method });

beforeEach(() => {
  vi.stubEnv('MF_REVALIDATE_SECRET', 's3cret');
  vi.stubEnv('NODE_ENV', 'test');
});

describe('proxy — /internal/*', () => {
  it('시크릿이 맞으면 통과시킨다', async () => {
    const res = proxy(request('s3cret'));
    // NextResponse.next() 는 이 헤더로 "다음 단계로" 를 표시한다.
    expect(res.headers.get('x-middleware-next')).toBe('1');
  });

  it('시크릿이 틀리면 401 이 아니라 404 다', async () => {
    // 이런 라우트가 있다는 사실 자체를 알릴 이유가 없다.
    const res = proxy(request('wrong'));
    expect(res.status).toBe(404);
    expect(await res.text()).toBe('not found');
  });

  it('헤더가 없으면 404 다', async () => {
    expect(proxy(request()).status).toBe(404);
  });

  it('서버에 시크릿이 설정되지 않았으면 아무도 못 들어온다', async () => {
    // fail-closed. 환경변수를 빠뜨린 배포가 열린 엔드포인트가 되면 안 된다.
    vi.stubEnv('MF_REVALIDATE_SECRET', undefined);
    expect(proxy(request('s3cret')).status).toBe(404);
  });
});

describe('proxy — /api/lab/*', () => {
  it('프로덕션에서 DELETE 는 404 다', async () => {
    // 인증 없이 서버 상태(로더 카운터)를 바꾸는 유일한 경로다.
    // 저장소가 공개라 경로도 공개된다 — 프로덕션에는 없는 것으로 한다.
    vi.stubEnv('NODE_ENV', 'production');
    const res = proxy(lab('DELETE'));
    expect(res.status).toBe(404);
    expect(await res.text()).toBe('not found');
  });

  it('프로덕션에서도 GET 은 통과시킨다', () => {
    // `/lab` 화면과 배포 검증 절차가 읽는다. 노출값은 remote 가 이미 공개하는 것뿐이다.
    vi.stubEnv('NODE_ENV', 'production');
    expect(proxy(lab('GET')).headers.get('x-middleware-next')).toBe('1');
  });

  it('로컬에서는 DELETE 가 통과한다 — 실험 절차가 리셋을 쓴다', () => {
    expect(proxy(lab('DELETE')).headers.get('x-middleware-next')).toBe('1');
  });

  it('시크릿이 없어도 막히지 않는다 — /internal 규칙이 새면 안 된다', () => {
    // 여기서 checkMfSecret 로 떨어지면 GET 까지 404 가 되어 /lab 이 깨진다.
    vi.stubEnv('MF_REVALIDATE_SECRET', undefined);
    expect(proxy(lab('GET')).headers.get('x-middleware-next')).toBe('1');
  });
});

describe('config.matcher', () => {
  it('/internal 과 /api/lab 아래만 가로챈다', () => {
    expect(config.matcher).toEqual(['/internal/:path*', '/api/lab/:path*']);
  });

  it('라우트 안의 검사를 대체하지 않는다 — matcher 가 틀어져도 뚫리면 안 된다', () => {
    // 이 단언은 규칙을 문서로 굳히는 용도다. 실제 이중 방어는
    // /internal/mf-warm 페이지와 /api/lab/stats 의 DELETE 가 각자 다시 본다.
    expect(config.matcher).toHaveLength(2);
  });
});
