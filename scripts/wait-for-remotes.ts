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
 * 포트가 열렸는지가 아니라 **host 가 실제로 가져갈 것**이 200 을 주는지를 본다.
 * 포트만 확인하면 아직 컴파일 중인 서버를 준비됐다고 오판한다.
 *
 * remote 하나가 host 에게 주는 것은 **두 가지**이고, 서로 다른 프로세스가 만든다
 * (각 remote 의 `dev` 스크립트가 concurrently 로 둘을 같이 띄운다).
 *
 *   web — 브라우저가 받는 번들.  `vite dev` / `rsbuild dev` 가 메모리에서 서빙
 *   ssr — host 서버가 받아 실행하는 CJS 번들.  `--watch` 빌드가 dist 에 쓴 것을
 *         dev 서버 미들웨어가 `/mf-server.cjs` 로 내려준다
 *
 * **둘 다 기다려야 한다.** web 만 보면 SSR 번들이 아직 없는 창이 남고, 그 사이에
 * 브라우저가 들어오면 host 의 서버 로더가 404 를 만나 페이지가 500 으로 죽는다
 * (`apps/host/src/mf/server-loader.ts` 의 `loadServerBundle`).
 *
 * 시간 안에 못 뜨면 **막지 않고 경고만 남기고 통과**한다. remote 없이 host 만 띄우는
 * 것도 정당한 작업 방식이고(진단 화면 등), dev 가 영영 안 뜨는 쪽이 더 나쁘다.
 */
import { REMOTE_LIST, ssrBundleUrl, webManifestUrl } from '@mfa/remote-config';

const TIMEOUT_MS = Number(process.env.WAIT_FOR_REMOTES_TIMEOUT ?? 60_000);
const INTERVAL_MS = 300;
const FETCH_TIMEOUT_MS = 5000;

/**
 * remote 마다 기다릴 URL 두 개. **remote 이름 말고는 아무것도 이 파일이 알지 못한다.**
 *
 * 노출 컴포넌트를 여기 적지 않는 것이 중요하다. expose 목록은 remote 사정으로 늘고
 * 줄어드는데, 그때마다 host 쪽 스크립트를 같이 고쳐야 한다면 그건 결합이다.
 * 필요한 모듈 URL 은 매니페스트에서 읽어낸다(`webReady`).
 *
 * URL 조립도 `@mfa/remote-config` 가 한다. **기다리는 URL 과 host 가 실제로 가져가는 URL 이
 * 어긋나면 게이트가 헛돈다** — 같은 함수를 host 의 `apps/host/src/mf/remote-endpoints.ts` 가
 * 쓰므로 그 어긋남이 구조적으로 안 생긴다.
 */
const REMOTES = REMOTE_LIST.map(({ name }) => ({
  name,
  web: webManifestUrl(name),
  ssr: ssrBundleUrl(name),
}));

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

async function fetchOk(url: string): Promise<Response | null> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    return res.ok ? res : null;
  } catch {
    return null;
  }
}

/**
 * MF 매니페스트 중 **이 스크립트가 읽는 부분만**.
 *
 * 전체 스키마를 옮겨 적지 않는다. 여기서 필요한 건 "remoteEntry 가 어디 있는가" 하나이고,
 * 나머지를 적어두면 스펙이 바뀔 때마다 쓰지도 않는 필드 때문에 이 파일을 고치게 된다.
 * catalog(Vite)와 cart(Rsbuild)가 서로 다른 번들러인데도 이 필드들은 똑같이 채운다.
 */
interface MfManifest {
  metaData?: {
    publicPath?: string;
    remoteEntry?: { name?: string; path?: string };
  };
}

/**
 * 매니페스트가 스스로 공표한 remoteEntry 의 절대 URL.
 *
 * MF 매니페스트 스펙의 `metaData.publicPath` + `metaData.remoteEntry` 를 조립한다.
 * catalog(Vite) 와 cart(Rsbuild) 가 서로 다른 번들러인데도 같은 필드를 채운다 —
 * 그래서 이 조립은 번들러를 몰라도 된다.
 *
 * `publicPath` 가 절대 URL 이 아닌 경우(`auto` 등)를 대비해 매니페스트 URL 을 기준으로 푼다.
 */
function remoteEntryUrl(
  manifest: MfManifest | null,
  manifestUrl: string,
): string | null {
  const { publicPath, remoteEntry } = manifest?.metaData ?? {};
  if (!remoteEntry?.name) return null;

  const base =
    publicPath && /^https?:\/\//.test(publicPath)
      ? publicPath
      : new URL('.', manifestUrl).href;
  const dir = remoteEntry.path
    ? `${remoteEntry.path.replace(/^\/+|\/+$/g, '')}/`
    : '';
  return new URL(`${dir}${remoteEntry.name}`, base).href;
}

/**
 * web 준비 판정 — 매니페스트만으로는 부족해서 두 단계다.
 *
 * ① 매니페스트 200 — 번들러가 MF 산출물을 낼 만큼은 진행됐다
 * ② 매니페스트가 가리키는 remoteEntry 200 — 실제 코드를 서빙할 수 있다
 *
 * ②가 따로 필요한 이유는 매니페스트가 플러그인이 미리 만들어 두는 **정적 산출물**이라,
 * 모듈 파이프라인이 아직 못 답하는 상태에서도 200 을 줄 수 있기 때문이다. remoteEntry 는
 * 그 파이프라인을 통과해야 나오므로 "코드를 줄 수 있다"의 증거가 된다.
 *
 * ⚠️ 이 저장소 기준으로는 지금 둘의 시차가 없다 — catalog 를 콜드 캐시로 격리 기동해
 * 실측한 결과 매니페스트 302ms / remoteEntry 325ms / 프리번들 완료 마커
 * (`node_modules/.vite/deps/_metadata.json`) 301ms 로 사실상 동시였다.
 * `vite.config.ts` 의 `optimizeDeps.entries` + `include` 가 기동 시점에 프리번들을
 * 끝내주기 때문이다. ②는 그 설정이 사라지거나 remote 가 늘었을 때를 위한 보험이다.
 */
async function webReady(manifestUrl: string): Promise<boolean> {
  const res = await fetchOk(manifestUrl);
  if (!res) return false;

  let entryUrl: string | null;
  try {
    entryUrl = remoteEntryUrl((await res.json()) as MfManifest, manifestUrl);
  } catch {
    // 매니페스트가 아직 온전한 JSON 이 아니다 — 다음 폴링에서 다시 본다
    return false;
  }

  // 매니페스트가 remoteEntry 를 공표하지 않으면 ①까지로 만족한다
  if (!entryUrl) return true;
  return Boolean(await fetchOk(entryUrl));
}

const ssrReady = async (url: string): Promise<boolean> =>
  Boolean(await fetchOk(url));

interface Probe {
  label: string;
  url: string;
  isReady: (url: string) => Promise<boolean>;
}

/** `{ name, web, ssr }` → 실제로 폴링할 프로브 목록 */
const PROBES: Probe[] = REMOTES.flatMap(({ name, web, ssr }) => [
  { label: `${name} web`, url: web, isReady: webReady },
  { label: `${name} ssr`, url: ssr, isReady: ssrReady },
]);

async function waitFor({ label, url, isReady }: Probe): Promise<boolean> {
  const started = Date.now();
  while (Date.now() - started < TIMEOUT_MS) {
    if (await isReady(url)) {
      console.log(`[wait-remotes] ${label} 준비됨 (${Date.now() - started}ms)`);
      return true;
    }
    await sleep(INTERVAL_MS);
  }
  console.warn(
    `[wait-remotes] ${label} 가 ${TIMEOUT_MS}ms 안에 응답하지 않았습니다. 그대로 진행합니다: ${url}`,
  );
  return false;
}

await Promise.all(PROBES.map(waitFor));
