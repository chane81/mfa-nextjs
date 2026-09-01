import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * ⚠️ 상대 경로가 아니라 **자기 패키지 이름**으로 부른다.
 *
 * 이 패키지는 번들러 없이 Node 가 직접 읽으므로(`exports` 가 소스 `.ts` 를 가리킨다)
 * 상대 import 에는 확장자가 필수다. 그런데 `./index.ts` 라고 적으면 이번엔 tsc 가 막는다 —
 * `allowImportingTsExtensions` 는 이 소스를 검사하는 **모든 소비처**가 켜야 하는 플래그고,
 * 그중엔 dist 를 emit 하는 프로젝트가 있어서 켤 수 없다.
 *
 *   error TS5097: An import path can only end with a '.ts' extension
 *                 when 'allowImportingTsExtensions' is enabled.
 *
 * 자기 참조(self-reference)는 양쪽을 다 만족한다. Node 는 `exports` 를 가진 패키지가
 * 자기 이름을 부르는 걸 지원하고(v12.16+), tsc 는 소비처와 똑같은 경로로 해석한다.
 * 확장자 문제 자체가 사라진다.
 */
import { MF_FILES } from '@mfa/remote-config';

/**
 * `@mfa/remote-config` 의 **node 전용 표면.**
 *
 * ## 왜 `index.ts` 와 갈라져 있나
 *
 * `index.ts` 는 host 의 **브라우저 번들에 실린다**(`stylesPath` · `MF_FILES` ·
 * `REMOTE_NAMES` 를 `RemoteComponent` 가 쓴다). 거기에 `node:fs` import 가 하나라도
 * 섞이면 Turbopack 이 브라우저 그래프에서 그 모듈을 해석하다 터진다.
 *
 * 그래서 파일을 나눈다. 이 파일을 부르는 쪽은 셋뿐이고 전부 node 다.
 *
 *   번들러 config   apps/remote-catalog/vite*.ts, apps/remote-cart/rsbuild*.ts
 *   빌드 스크립트   scripts/stamp-remote-version.ts
 *
 * 타입 검사도 갈라져 있다 — `tsconfig.json` 은 `types: []` 로 브라우저 안전성을
 * 강제하고, 이 파일만 `tsconfig.node.json` 이 `@types/node` 를 붙여 검사한다.
 * 그래서 실수로 `index.ts` 에 node 전용 코드를 넣으면 typecheck 가 잡는다.
 *
 * ## ⚠️ `scripts/serve-remote-dist.ts` 는 여기를 **정적 import 하지 않는다**
 *
 * 그 파일은 remote 의 런타임 이미지 안에서 `node_modules` 없이 돈다. 그쪽은 지금처럼
 * 동적 import 로만 워크스페이스를 건드려야 한다 — 근거는 그 파일 상단 주석.
 */

/**
 * 빌드 버전. `scripts/mf-build-version.ts` 가 빌드 **직전에** `.mf-version` 에 써 둔다.
 *
 * 이 값이 자산 URL 접두사와 출력 디렉터리를 **동시에** 결정한다. 그래서 웹 자산까지
 * `/v<version>/` 아래 불변 경로로 나가고, 재배포가 기존 URL 을 덮어쓰지 않는다.
 * (버전이 내용 해시가 아니라 빌드 ID 인 이유는 `mf-build-version.ts` 주석 참고)
 *
 * dev(watch)에는 파일이 없다. 매 저장마다 경로가 바뀌면 의미가 없고, dev 서버는
 * 메모리에서 서빙하므로 불변성도 필요 없다.
 *
 * ## 파일이 있어도 **내용이 비어 있으면 없는 것으로 본다**
 *
 * 존재 여부만 보면 `dist/v` 라는 버전 없는 버전 경로가 만들어진다. 실제로 그 갈래가
 * 있었다 — 한 remote 의 웹 빌드는 빈 값을 falsy 로 걸렀는데(`|| null`) 같은 remote 의
 * SSR 빌드는 `existsSync` 만 봤다. 두 산출물이 **다른 디렉터리로 나가고**, stamp 는
 * 한쪽만 찾지 못해 실패한다. 판정을 한 함수로 모으면 그 갈라짐이 구조적으로 안 생긴다.
 *
 * @param cwd 기본값은 `process.cwd()`. 번들러 config 는 그 앱 디렉터리에서 평가된다.
 */
export function readBuildVersion(cwd: string = process.cwd()): string | null {
  const file = resolve(cwd, '.mf-version');
  if (!existsSync(file)) return null;
  return readFileSync(file, 'utf8').trim() || null;
}

/**
 * 이 빌드의 출력 디렉터리. **웹 번들과 SSR 번들이 같은 값을 써야 한다** —
 * 둘이 한 배포 단위라 한 경로에 모여야 stamp 가 양쪽을 찾는다.
 *
 * 리포지터리 루트가 아니라 그 앱 기준 상대 경로다(`dist/v<version>`). 번들러들이
 * `outDir` / `distPath.root` 를 그렇게 받는다.
 */
export function versionedDist(version?: string | null): string {
  return version ? `dist/v${version}` : 'dist';
}

/**
 * 이 remote 의 자산 URL 접두사. Vite 의 `base` 와 Rsbuild 의 `output.assetPrefix` 가
 * 같은 값을 받는다.
 *
 * ⚠️ 두 번들러의 요구가 미묘하게 다르다. Vite `base` 는 **뒤에 슬래시가 있어야** 하고
 * (없으면 마지막 세그먼트를 디렉터리가 아니라 파일로 붙인다), Rsbuild `assetPrefix` 는
 * 붙이지 않는 쪽을 기대한다. 그래서 `trailingSlash` 를 인자로 받는다 — 이 차이를
 * 호출부가 문자열로 다시 조립하게 두면 SSOT 를 뽑은 의미가 없다.
 */
export function assetBase(
  publicUrl: string,
  version: string | null,
  { trailingSlash = false }: { trailingSlash?: boolean } = {},
): string {
  const base = version ? `${publicUrl}/v${version}` : publicUrl;
  return trailingSlash ? `${base}/` : base;
}

/**
 * remote 의 dev · preview 서버가 **디스크에서 직접 내려주는** 파일들.
 *
 * 웹 번들은 번들러가 메모리에서 서빙하지만 SSR 번들은 `--watch` 빌드가 디스크에
 * 쓰므로, dev 서버가 그 파일을 읽어 내려줘야 host 서버가 받아갈 수 있다.
 */
const SERVED_IN_DEV: readonly string[] = [`/${MF_FILES.ssrBundle}`];

/** preview 는 빌드 산출물을 서빙하는 자리라 버전 공표도 의미가 있다 */
const SERVED_IN_PREVIEW: readonly string[] = [
  `/${MF_FILES.ssrBundle}`,
  `/${MF_FILES.versionManifest}`,
];

/**
 * dev 에 **존재하지 않는 배포 개념.** 명시적으로 404 를 준다.
 *
 * 그냥 흘려보내면 번들러의 SPA 폴백이 `index.html` 을 200 으로 돌려주고, host 는 그걸
 * 매니페스트로 파싱하려다 실패한다. 결과는 같지만(폴백) **원인이 로그에서 사라진다.**
 *
 * 더 나쁜 갈래도 있다. 직전 `pnpm build` 가 남긴 `mf-version.json` 을 dev 가 내려주면
 * 하지도 않은 배포를 공표하게 된다 — host 가 `/v<ver>/mf-server.cjs` 를 요청하고,
 * dev 서버는 그 경로를 모르니 SPA 폴백(200)을 주고, 그 바이트가 공표된 해시와 달라
 * 무결성 검사에서 죽는다.
 *
 *   Error: remote 'catalog' 번들 무결성 불일치 (공표=sha384-…, 실제=sha384-…)
 *
 * 안 내려주면 host 는 버전을 모르는 상태가 되어 버전 없는 엔트리로 폴백한다.
 * 그게 dev 에서 의도된 경로다(`server-loader.ts` 의 `resolveEntry` 주석).
 */
const NOT_IN_DEV: readonly string[] = [`/${MF_FILES.versionManifest}`];

/**
 * 이 미들웨어가 어느 서버에 붙었는지.
 *
 * env 로 판별하지 않는다. `pnpm dev` 는 dev 서버와 `build --watch` 를 **동시에** 돌리므로
 * `NODE_ENV` 로는 갈리지 않고, Vite 의 `command` 는 dev 와 preview 가 둘 다 `serve` 다.
 * 호출부가 훅으로 아는 사실(`configureServer` vs `configurePreviewServer`,
 * Rsbuild 의 `action`)을 그대로 넘겨받는다.
 */
export type ServerKind = 'dev' | 'preview';

/**
 * node `http` 미들웨어의 최소 표면.
 *
 * Vite 의 `Connect.NextHandleFunction` 과 Rspack dev 서버의 미들웨어가 같은 모양이라
 * 양쪽이 이 시그니처를 그대로 받는다. 번들러 타입을 import 하지 않는 이유는 이 패키지가
 * 어느 번들러에도 의존하지 않기 위해서다 — 그러면 remote 하나가 번들러를 갈아타도
 * 이 파일은 안 바뀐다.
 */
interface ServerRequest {
  url?: string | undefined;
}

interface ServerResponse {
  statusCode: number;
  setHeader(name: string, value: string): unknown;
  end(body?: string): unknown;
}

export type MfDevMiddleware = (
  req: ServerRequest,
  res: ServerResponse,
  next: () => void,
) => void;

/**
 * remote 의 dev · preview 서버에 붙이는 미들웨어를 만든다.
 *
 * ## 왜 공용인가
 *
 * catalog(Vite)와 cart(Rsbuild)가 **글자 그대로 같은 60줄**을 각자 갖고 있었다 —
 * 서빙 대상 목록, 404 JSON 본문, MIME 분기, CORS 헤더, `no-store`. 번들러가 다르다는
 * 게 이 저장소의 전제지만, 이 미들웨어가 하는 일에는 번들러가 전혀 안 나온다.
 * host 가 dev 에서 remote 를 어떻게 받아가는지는 **remote 전체의 계약**이라 한 곳에 있어야 한다.
 *
 * 갈라졌을 때가 나쁘다. 한쪽 remote 만 `mf-version.json` 을 404 로 감추면 그 remote 만
 * dev 에서 버전 경로를 타고, 무결성 검사에서 죽는다 — remote 별로 증상이 다르게 나타난다.
 *
 * @param dist 이 remote 의 `dist` **절대 경로**. 서빙 대상을 여기서 읽는다.
 * @param kind 훅이 알려준 서버 종류. dev 와 preview 의 서빙 대상이 다르다.
 */
export function createMfDevMiddleware({
  dist,
  kind,
}: {
  dist: string;
  kind: ServerKind;
}): MfDevMiddleware {
  const dev = kind === 'dev';
  const served = dev ? SERVED_IN_DEV : SERVED_IN_PREVIEW;

  return (req, res, next) => {
    const path = req.url?.split('?')[0] ?? '';

    if (dev && NOT_IN_DEV.includes(path)) {
      res.statusCode = 404;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.end(
        '{"error":"dev 에는 버전 공표가 없습니다. host 는 버전 없는 엔트리로 폴백합니다."}',
      );
      return;
    }

    if (!served.includes(path)) {
      next();
      return;
    }

    let body: string;
    try {
      body = readFileSync(resolve(dist, `.${path}`), 'utf8');
    } catch {
      res.statusCode = 404;
      res.end(
        '// 아직 없습니다. `pnpm build` (stamp 포함) 또는 watch 빌드를 확인하세요.',
      );
      return;
    }

    res.setHeader(
      'Content-Type',
      path.endsWith('.json')
        ? 'application/json; charset=utf-8'
        : 'application/javascript; charset=utf-8',
    );
    // host(3000) 페이지가 교차 출처로 이 파일을 받아간다
    res.setHeader('Access-Control-Allow-Origin', '*');
    // 버전 경로는 불변이라 오래 캐시해도 되지만, 로컬 실험에서는 혼동만 키운다
    res.setHeader('Cache-Control', 'no-store');
    res.end(body);
  };
}

/**
 * remote 가 노출할 파일 목록을 **디렉터리에서 읽는다.**
 *
 * `exposes` 를 손으로 적으면 파일을 추가할 때마다 번들러 설정을 같이 고쳐야 하고,
 * 빠뜨리면 "파일은 있는데 host 가 못 찾는" 상태가 된다. 이 저장소의 두 remote 는
 * **`src/exposes/` 에 있는 것만 노출**한다는 규칙이 이미 있으므로, 그 규칙을 설정에
 * 다시 적는 대신 디렉터리를 그대로 읽는다.
 *
 * 번들러가 둘(Vite · Rsbuild)이라 여기 둔다 — `createMfDevMiddleware` 와 같은 이유다.
 * 각자 구현하면 "어느 파일이 expose 인가"가 remote 마다 갈린다.
 *
 * ## 무엇을 거르나
 *
 * 이 저장소는 **테스트를 대상 소스 옆에 둔다**. 그래서 `src/exposes/` 에는 expose 가
 * 아닌 이웃 파일이 같이 산다(`exposes.test.tsx`). 그런 파일이 expose 로 올라가면
 * remote 의 공개 계약이 조용히 늘어나고, dev 에서는 사전 transform 까지 시도해
 * `@tests/*` alias 를 못 찾고 터진다(known-issues H-2).
 *
 * 그래서 **제외 규칙을 인자로 받는다.** 호출부에 눈에 보이게 두고, dev 가 볼 게 아닌
 * 이웃 파일이 또 생기면(`*.stories.tsx` 등) 거기에 한 줄 더 넣는다.
 *
 * ## 계약과 어긋나면 누가 잡나
 *
 * 여기서 만든 목록은 `@mfa/contracts` 의 `MODULE_IDS` 와 반드시 같아야 한다. 그 대조는
 * 각 remote 의 `exposes/contract.test.ts` 가 한다 — 파일만 추가하고 props 타입을 안
 * 적었거나, 계약에만 있고 파일이 없는 경우가 거기서 걸린다.
 *
 * @param dir `cwd` 기준 상대 디렉터리 (예: `'./src/exposes'`)
 * @param ignore 제외할 파일명 규칙. 기본값은 없다 — 호출부가 명시한다.
 */
export function readExposes(
  dir: string,
  { ignore = [], cwd = process.cwd() }: ExposeScanOptions = {},
): ExposeScan {
  const abs = resolve(cwd, dir);

  const names = readdirSync(abs)
    .filter((name) => name.endsWith('.tsx'))
    .filter((name) => !ignore.some((rule) => rule.test(name)))
    .sort();

  const entries = names.map(
    (name) =>
      [`./${name.replace(/\.tsx$/, '')}`, `${dir}/${name}`] as [string, string],
  );

  return {
    exposes: Object.fromEntries(entries),
    files: entries.map(([, file]) => file),
  };
}

export interface ExposeScanOptions {
  /** 제외할 파일명 규칙. 파일명(디렉터리 제외)에 대고 검사한다. */
  ignore?: RegExp[];
  cwd?: string;
}

export interface ExposeScan {
  /** MF 플러그인에 그대로 넘기는 `{ './Name': './src/exposes/Name.tsx' }` */
  exposes: Record<string, string>;
  /** 같은 파일들의 경로만. dev 사전 transform · 의존성 스캔 진입점이 쓴다. */
  files: string[];
}
