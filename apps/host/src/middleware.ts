import { NextResponse, type NextRequest } from "next/server";

import { checkMfSecret } from "@/lib/mf-secret";

/**
 * `/internal/*` 은 배포 파이프라인 전용이다. 시크릿 없이는 못 들어온다.
 *
 * ## 왜 페이지 안에서 막는 것으로 부족한가
 * 페이지 컴포넌트에서 `notFound()` 를 불러도 **상태 코드가 200 으로 나간다.**
 * 그 시점에는 루트 레이아웃이 이미 flush 되기 시작해 응답 헤더가 확정된 뒤이기 때문이다.
 * (`instant = false` 로 PPR 셸을 없애도 마찬가지였다 — 실측)
 *
 * middleware 는 렌더 파이프라인에 들어가기 전에 돌기 때문에 진짜 404 를 낼 수 있다.
 * 페이지 안의 검사도 그대로 남겨둔다 — matcher 설정이 틀어져도 뚫리지 않게.
 */
export function middleware(req: NextRequest) {
  if (checkMfSecret(req.headers)) return NextResponse.next();

  // 401 이 아니라 404 — 이런 라우트가 있다는 사실 자체를 알릴 이유가 없다
  return new NextResponse("not found", { status: 404 });
}

export const config = {
  matcher: ["/internal/:path*"],
};
