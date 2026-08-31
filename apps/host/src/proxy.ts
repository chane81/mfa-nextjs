import { NextResponse, type NextRequest } from 'next/server';

import { checkMfSecret } from '@/lib/mf-secret';

/**
 * 렌더 파이프라인 앞에서 라우트를 잘라내는 곳.
 *
 * 두 가지를 막는다.
 *
 * | 경로            | 규칙                                            |
 * | --------------- | ----------------------------------------------- |
 * | `/internal/*`   | 배포 파이프라인 전용. 시크릿 없이는 못 들어온다 |
 * | `/api/lab/*`    | 계측 **리셋**(DELETE)은 프로덕션에 없다         |
 *
 * ## 왜 페이지·라우트 안에서 막는 것으로 부족한가
 * 페이지 컴포넌트에서 `notFound()` 를 불러도 **상태 코드가 200 으로 나간다.**
 * 그 시점에는 루트 레이아웃이 이미 flush 되기 시작해 응답 헤더가 확정된 뒤이기 때문이다.
 * (`instant = false` 로 PPR 셸을 없애도 마찬가지였다 — 실측)
 *
 * proxy 는 렌더 파이프라인에 들어가기 전에 돌기 때문에 진짜 404 를 낼 수 있다.
 * 각 라우트 안의 검사도 그대로 남겨둔다 — matcher 설정이 틀어져도 뚫리지 않게.
 *
 * ## 파일 이름이 proxy 인 이유
 * Next 16 에서 `middleware` 파일 규약이 deprecated 되고 `proxy` 로 바뀌었다.
 * 파일명·export 이름만 달라졌고 `config.matcher` 는 그대로다.
 * https://nextjs.org/docs/app/api-reference/file-conventions/proxy
 */

/** 401 이 아니라 404 — 이런 라우트가 있다는 사실 자체를 알릴 이유가 없다 */
const gone = () => new NextResponse('not found', { status: 404 });

export function proxy(req: NextRequest) {
  /**
   * `DELETE /api/lab/stats` 는 인증 없이 서버 상태(로더 카운터)를 바꾼다.
   * 저장소가 공개라 경로도 공개된다 — 프로덕션에서는 아예 없는 것으로 한다.
   * 계측 실험은 `pnpm dev` 에서 돌린다.
   *
   * 읽기(`GET`)는 그대로 둔다. 노출하는 값이 remote 의 entry·버전인데,
   * 그건 remote 가 `mf-version.json` 으로 이미 공개하는 것이고
   * `/lab` 화면과 배포 검증 절차(docs/02-architecture/04-remote-lifecycle.md)가 쓴다.
   */
  if (req.nextUrl.pathname.startsWith('/api/lab')) {
    if (req.method === 'DELETE' && process.env.NODE_ENV === 'production')
      return gone();

    return NextResponse.next();
  }

  if (checkMfSecret(req.headers)) return NextResponse.next();

  return gone();
}

export const config = {
  matcher: ['/internal/:path*', '/api/lab/:path*'],
};
