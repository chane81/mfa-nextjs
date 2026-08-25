import type { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { config, proxy } from './proxy';

/**
 * `/internal/*` 은 배포 파이프라인 전용이다. 페이지 안에서 `notFound()` 를 불러도
 * **상태 코드가 200 으로 나간다** — 그 시점에는 루트 레이아웃이 이미 flush 되기 시작해
 * 응답 헤더가 확정된 뒤다. proxy 는 렌더 파이프라인 앞이라 진짜 404 를 낼 수 있다.
 */
const request = (secret?: string) =>
  ({
    headers: new Headers(secret === undefined ? {} : { 'x-mf-secret': secret }),
  }) as NextRequest;

beforeEach(() => {
  vi.stubEnv('MF_REVALIDATE_SECRET', 's3cret');
});

describe('proxy', () => {
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

describe('config.matcher', () => {
  it('/internal 아래만 가로챈다', () => {
    expect(config.matcher).toEqual(['/internal/:path*']);
  });

  it('페이지 안의 검사를 대체하지 않는다 — matcher 가 틀어져도 뚫리면 안 된다', () => {
    // 이 단언은 규칙을 문서로 굳히는 용도다. 실제 이중 방어는
    // /internal/mf-warm 페이지가 자체적으로 시크릿을 다시 본다.
    expect(config.matcher).toHaveLength(1);
  });
});
