#!/usr/bin/env node
/**
 * host dev 를 remote 준비 이후로 미룬다. **dev 전용**이다.
 *
 * ## 왜 필요한가
 * Vite dev 는 기동 직후 의존성 프리번들을 돌린다. 그게 끝나기 전에 host 페이지가
 * remote 모듈을 당기면, 페이지는 최적화 이전 모듈을 잡은 채로 남는다.
 *
 *   TypeError: _jsxDEV is not a function
 *     at ProductGrid (http://localhost:3001/src/exposes/ProductGrid.tsx)
 *
 * 보통의 Vite 앱이라면 최적화가 끝날 때 HMR 클라이언트가 페이지를 새로고침해 스스로
 * 낫는다. 그런데 이 모듈 그래프는 **host(3000) 페이지 안에** 있고, 새로고침 신호를 보내는
 * 쪽은 remote(3001) 의 HMR 클라이언트라 신호가 닿지 않는다. 그래서 첫 로드만 깨지고
 * 수동 새로고침 뒤에는 멀쩡한, 헷갈리는 증상이 된다.
 *
 * ## 무엇을 기다리나
 * 포트가 열렸는지가 아니라 **host 가 실제로 가져갈 모듈**이 200 을 주는지를 본다.
 * 그 요청이 곧 프리번들 완료를 강제한다(Vite 가 최적화가 끝날 때까지 응답을 붙든다).
 * 포트만 확인하면 최적화 중인 서버를 준비됐다고 오판한다.
 *
 * 시간 안에 못 뜨면 **막지 않고 경고만 남기고 통과**한다. remote 없이 host 만 띄우는
 * 것도 정당한 작업 방식이고(진단 화면 등), dev 가 영영 안 뜨는 쪽이 더 나쁘다.
 */
const TIMEOUT_MS = Number(process.env.WAIT_FOR_REMOTES_TIMEOUT ?? 60_000);
const INTERVAL_MS = 300;

/**
 * remote 마다 "이게 200 이면 준비됐다" 는 URL.
 *
 * catalog(Vite): 노출 모듈 자체를 찌른다 — 이 요청이 프리번들을 완료시킨다.
 * cart(Rsbuild): 번들러가 기동 시 전체를 컴파일하므로 매니페스트면 충분하다.
 */
const REMOTES = [
  {
    name: "catalog",
    url: `${process.env.NEXT_PUBLIC_REMOTE_CATALOG_ENTRY?.replace(/\/mf-manifest\.json$/, "") ?? "http://localhost:3001"}/src/exposes/ProductGrid.tsx`,
  },
  {
    name: "cart",
    url: `${process.env.NEXT_PUBLIC_REMOTE_CART_ENTRY?.replace(/\/mf-manifest\.json$/, "") ?? "http://localhost:3002"}/mf-manifest.json`,
  },
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function ready(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    return res.ok;
  } catch {
    return false;
  }
}

async function waitFor({ name, url }) {
  const started = Date.now();
  while (Date.now() - started < TIMEOUT_MS) {
    if (await ready(url)) {
      console.log(`[wait-remotes] ${name} 준비됨 (${Date.now() - started}ms)`);
      return true;
    }
    await sleep(INTERVAL_MS);
  }
  console.warn(
    `[wait-remotes] ${name} 가 ${TIMEOUT_MS}ms 안에 응답하지 않았습니다. 그대로 진행합니다: ${url}`,
  );
  return false;
}

await Promise.all(REMOTES.map(waitFor));
