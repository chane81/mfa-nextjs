/**
 * remote 배치(topology)의 단일 진실 공급원(SSOT).
 *
 * "이 저장소에 remote 가 몇 개이고, 각각 어느 포트에 뜨고, 어떤 env 로 주소를 바꾸고,
 * 어떤 파일명으로 산출물을 내보내는가" — 이 지식은 원래 아홉 군데에 흩어져 있었다
 * (host 런타임, host 서버 로더, dev 대기 스크립트, 정적 서버, stamp 스크립트,
 * Vite config, Rsbuild config, 그리고 세 개의 package.json 스크립트).
 * 하나만 고치고 나머지를 잊으면 증상이 제각각으로 나타나서 원인을 찾기 어렵다.
 * 예: 포트만 바꾸면 dev 대기 스크립트가 영영 안 뜨는 remote 를 60초 기다린다.
 *
 * ## 왜 빌드 산출물이 없나 (`exports` 가 이 소스를 직접 가리킨다)
 *
 * 이 파일을 읽는 쪽이 **다섯 종류**다.
 *
 *   node 스크립트 (.mjs)      scripts 아래 전부
 *   번들러 config (TS/node)   apps/remote-catalog/vite.config.ts, apps/remote-cart/rsbuild.config.ts
 *   Next 설정 (TS/node)       apps/host/next.config.ts
 *   Next 번들 (TS)            apps/host/src/mf 아래
 *   워크스페이스 패키지 (TS)   packages/contracts
 *
 * `@mfa/contracts` 처럼 tsc 로 빌드하는 패키지로 만들면 `dist/` 가 생기기 전에는
 * 앞의 둘이 이 모듈을 못 읽는다. 앱 소스의 import 와 달리 **번들러 config 의 import 는
 * 프로세스 시작 즉시** 일어나서, watch 빌드가 dist 를 만들 틈이 없기 때문이다. 실측:
 *
 *   failed to load config from apps/remote-catalog/vite.config.ts
 *   Error: Failed to resolve entry for package "@mfa/contracts".
 *
 * 빌드 없는 소스를 그대로 export 하면 그 문제 자체가 사라진다.
 *
 * ## 왜 `.ts` 로 둘 수 있나
 *
 * Node 24 는 타입 스트리핑으로 `.ts` 를 그대로 실행한다. Node 는 `node_modules` 안의
 * `.ts` 를 거부하지만, pnpm 워크스페이스 링크는 심볼릭 링크라 Node 가 realpath 로 풀면
 * `packages/remote-config/src/index.ts` — node_modules 밖이 되어 통과한다(실측).
 * Vite config 로드와 Next 브라우저 번들에서도 같이 확인했다.
 *
 * 그래서 `engines.node` 가 `>=24.19.0` 이다. 그 아래 버전에서는 이 패키지가 로드되지 않는다.
 *
 * ⚠️ 타입 스트리핑은 **지울 수 있는 문법만** 처리한다(enum·namespace·파라미터 프로퍼티 불가).
 * `tsconfig.json` 의 `erasableSyntaxOnly` 가 그걸 컴파일 타임에 막아준다.
 */

/**
 * `process` 를 여기서 최소한으로 선언한다.
 *
 * 빌드 산출물이 없다는 건 **소비처의 tsc 가 이 소스를 직접 검사한다**는 뜻이기도 하다
 * (`.d.ts` 였다면 `skipLibCheck` 가 넘겼을 자리다). 그런데 소비처 중에는
 * `@mfa/contracts` 처럼 브라우저용이라 `@types/node` 를 갖지 않는 패키지가 있어서,
 * 전역 `process` 에 기대면 그쪽 typecheck 가 깨진다.
 *
 * node 타입을 소비처마다 끌어오게 하는 대신 실제로 쓰는 한 조각만 여기서 선언한다.
 * 모듈 스코프 선언이라 `@types/node` 가 있는 소비처에서도 충돌하지 않는다.
 * 이 값을 읽는 함수는 `publicOrigin` 하나뿐이고, 그 함수는 node 전용이다.
 */
declare const process: { env: Record<string, string | undefined> };

/**
 * SSR 번들만 이름과 확장자를 나눠 둔다.
 *
 * 번들러가 둘을 따로 받기 때문이다 — Rsbuild 는 엔트리 키(`mf-server`)와
 * 출력 템플릿(`[name].cjs`)이 분리되어 있어서 합쳐진 문자열을 그대로 못 쓴다.
 * 아래 `MF_FILES.ssrBundle` 은 이 둘을 조립한 값이라 셋이 어긋날 수 없다.
 */
export const MF_SSR_BUNDLE = {
  name: 'mf-server',
  /** CommonJS 다. host 서버가 `new Function(…)` 으로 평가하기 때문. */
  extension: '.cjs',
} as const;

/**
 * MF 자동 타입 생성(DTS)이 쓰는 폴더 이름.
 *
 * remote 는 이 이름으로 `@mf-types/`(풀린 타입) · `@mf-types.zip` · `@mf-types.d.ts` 를
 * 내보내고, host 는 같은 이름으로 받아 푼다. dts-plugin 의 기본값과 같지만 **기본값에
 * 기대지 않고 명시한다** — 양쪽 설정에서 이 상수를 가리키면 한쪽만 바꿔서 어긋날 수 없다.
 *
 * 아래 `MF_FILES` 의 두 항목이 여기서 파생된다.
 */
export const MF_TYPES_FOLDER = '@mf-types';

/**
 * MF 산출물 파일명.
 *
 * remote 가 내보내고 host 가 받아가는 계약이라 양쪽이 같은 이름을 알아야 한다.
 * 이름이 어긋나면 404 가 아니라 **폴백 응답을 파싱하다 실패**하는 형태로 나타나서
 * (dev 서버의 SPA 폴백은 200 이다) 원인이 로그에서 잘 안 보인다.
 */
export const MF_FILES = {
  /** 브라우저 MF 런타임이 읽는 매니페스트 */
  webManifest: 'mf-manifest.json',
  /** host **서버**가 받아 실행하는 node 타깃 CJS 번들 */
  ssrBundle: `${MF_SSR_BUNDLE.name}${MF_SSR_BUNDLE.extension}`,
  /** remote 가 "지금 버전이 뭔지"를 공표하는 파일 (버전 경로 아래가 아니라 루트에 있다) */
  versionManifest: 'mf-version.json',
  /**
   * remote 가 컴파일한 Tailwind CSS.
   *
   * host 는 이 파일을 **가져오지 않는다.** 주소만 조립해
   * `<link rel="stylesheet" precedence>` 로 걸고(`RemoteComponent`), 받아 파싱하는 건
   * 브라우저다. React 19 가 그 `<link>` 를 `<head>` 로 올리며 중복을 제거한다.
   *
   * 이름을 고정하는 이유: 그래야 **주소를 계산으로 알 수 있기** 때문이다. 해시가 붙으면
   * host 가 remote 의 매니페스트를 받아 파싱해 자산 경로를 캐내야 하고, 그 순간 host 가
   * remote 의 빌드 산출물 구조에 묶인다. 캐시 무효화는 파일명 해시가 아니라 이미 있는
   * `/v<version>/` 불변 경로가 맡는다.
   */
  styles: 'style.css',
  /**
   * MF 자동 타입 생성(DTS)의 **API 타입** — `RemoteKeys` 와 `PackageType` 이 들어 있다.
   * host 가 이걸로 `@module-federation/runtime` 의 `loadRemote()` 를 모듈 확장한다.
   */
  typesApi: `${MF_TYPES_FOLDER}.d.ts`,
  /**
   * 같은 DTS 의 **타입 아카이브**. 각 expose 의 실제 시그니처가 이 안에 있고,
   * host 는 `mf dts --fetch` 로 받아 `@mf-types/<remote>/` 에 푼다.
   */
  typesArchive: `${MF_TYPES_FOLDER}.zip`,
} as const;

/**
 * remote 주소를 바꾸는 환경변수의 **이름** (값이 아니다).
 *
 * remote 하나당 **하나**다. 예전에는 셋이었다 — 브라우저용 매니페스트 URL,
 * host 서버용 SSR 번들 URL, 자산 오리진. 그런데 세 값의 차이는 오리진 뒤에 붙는
 * 파일명뿐이었고, 그 파일명은 이미 `MF_FILES` 에 있다. 즉 env 가 SSOT 를 문자열로
 * 복제하고 있었다. 복제된 쪽이 어긋나면 404 가 아니라 **폴백 응답을 파싱하다 실패**하는
 * 형태로 나타나서(dev 서버의 SPA 폴백은 200 이다) 원인이 로그에 안 보인다.
 *
 * 이제 env 는 오리진만 받고 파일명은 `webManifestUrl` / `ssrBundleUrl` 이 붙인다.
 * remote N 개에 환경변수 N 개다.
 */
export interface RemoteEnvKeys {
  /**
   * 이 remote 의 공개 오리진. 세 자리가 전부 여기서 파생된다.
   *   - remote 자신의 자산 URL 접두사 (`base` / `assetPrefix`)
   *   - 브라우저가 읽는 매니페스트 URL
   *   - host **서버**가 받아 실행하는 SSR 번들 URL
   */
  readonly publicUrl: string;
}

/**
 * remote 하나의 배치 정보. **이름은 여기 없다** — `REMOTES` 의 키가 곧 이름이다.
 *
 * 예전에는 `name` 필드가 있었고, 그래서 이름이 remote 하나당 세 번(`REMOTE_NAMES` 원소 ·
 * `REMOTES` 키 · 이 필드) 적혔다. 그중 키와 필드가 어긋나는 건 **타입이 못 잡았다**
 * (`satisfies Record<RemoteName, …>` 는 키 집합만 보고, 필드 타입이 `RemoteName` 이라
 * `catalog: { name: 'cart' }` 도 통과했다 — 실측). 이름을 한 군데로 줄여 그 상태를 없앤다.
 */
export interface RemoteConfig {
  readonly packageName: string;
  /** 리포지터리 루트 기준 경로. 스크립트가 dist 위치를 파생할 때 쓴다. */
  readonly workspaceDir: string;
  /** dev 서버 · `pnpm start` 정적 서버가 잡는 포트 */
  readonly devPort: number;
  readonly env: RemoteEnvKeys;
}

/** 순회용 항목. `REMOTE_LIST` 가 키를 `name` 으로 되붙여 만든다. */
export interface RemoteDefinition extends RemoteConfig {
  readonly name: RemoteName;
}

/**
 * remote 별 배치 정보.
 *
 * `env` 는 값이 아니라 **환경변수 이름**이다. 값을 꺼내는 방식이 소비처마다 다르기 때문이다.
 *
 * node 컨텍스트(스크립트·번들러 config·`next.config.ts`)는 `process.env[이름]` 으로
 * 동적으로 읽는다. 반면 host 의 **브라우저 번들**은 `process.env.리터럴` 형태만 빌드 타임에
 * 치환되고 동적 접근은 `undefined` 가 된다. 그래서 브라우저용 web 엔트리는
 * `apps/host/next.config.ts` 가 node 에서 이 목록을 순회해 값을 다 꺼낸 뒤 번들에 굽고,
 * host 코드는 그 결과 하나만 읽는다. 덕분에 host 쪽에는 remote 이름이 남지 않는다.
 *
 * **이 객체가 remote 이름의 원본이다.** `RemoteName` 도 `REMOTE_NAMES` 도 여기서 파생된다 —
 * remote 를 추가하려면 여기 항목 하나를 넣는 것이 전부고, "이름만 추가하고 정의를 빠뜨린"
 * 상태가 성립하지 않는다.
 */
export const REMOTES = {
  catalog: {
    packageName: '@mfa/remote-catalog',
    workspaceDir: 'apps/remote-catalog',
    devPort: 3001,
    env: {
      publicUrl: 'REMOTE_CATALOG_PUBLIC_URL',
    },
  },
  cart: {
    packageName: '@mfa/remote-cart',
    workspaceDir: 'apps/remote-cart',
    devPort: 3002,
    env: {
      publicUrl: 'REMOTE_CART_PUBLIC_URL',
    },
  },
} as const satisfies Record<string, RemoteConfig>;

/**
 * remote 이름. host 가 `catalog/ProductGrid` 처럼 이 이름으로 모듈을 지목한다.
 *
 * `@mfa/contracts` 가 이 둘을 재-export 한다. 소비처는 그쪽 이름으로 계속 import 해도 되고,
 * 여기가 원본이다.
 */
export type RemoteName = keyof typeof REMOTES;

/**
 * 순회용 이름 목록.
 *
 * ⚠️ 순서는 **`REMOTES` 의 키 선언 순서**다. 문자열 키의 열거 순서는 삽입 순서로
 * 스펙에 고정돼 있고(정수 인덱스 키가 아니므로 재정렬되지 않는다), `index.test.ts` 가
 * 그 성질을 회귀 테스트로 지킨다. 배열 리터럴로 따로 적던 때보다 눈에 덜 보이는 계약이라
 * 테스트를 남겨 둔다.
 */
export const REMOTE_NAMES = Object.keys(REMOTES) as readonly RemoteName[];

/** 순회용. 키를 `name` 으로 되붙인다. `REMOTE_NAMES` 순서를 따른다. */
export const REMOTE_LIST: readonly RemoteDefinition[] = REMOTE_NAMES.map(
  (name) => ({ name, ...REMOTES[name] }),
);

/** 인자로 받은 문자열이 remote 이름인지 확인하고 좁혀준다 */
export function assertRemoteName(value: string): RemoteName {
  if (!(REMOTE_NAMES as readonly string[]).includes(value)) {
    throw new Error(
      `알 수 없는 remote '${value}'. 가능한 값: ${REMOTE_NAMES.join(', ')}`,
    );
  }
  return value as RemoteName;
}

/**
 * CI 가 remote 별로 읽는 저장소 Variable 이름들.
 *
 * ## 왜 이게 여기 있나
 *
 * 배포 워크플로가 remote 마다 두 값을 필요로 한다 — 공개 URL 과 Dokploy 애플리케이션 id.
 * 예전에는 그 매핑을 GHA 표현식 안에 삼항 사슬로 적었다.
 *
 *   REMOTE_URL="$([ "$REMOTE" = catalog ] && echo "$CATALOG_URL" || echo "$CART_URL")"
 *
 * 이 형태는 remote 가 셋이 되는 순간 **조용히 틀린다.** catalog 가 아닌 모든 remote 가
 * cart 의 URL 을 읽고, 그 URL 로 배포 전후 버전을 비교해 "성공" 으로 끝난다.
 * 같은 함정을 `application-id` 쪽에서 이미 한 번 밟았다(deploy.yml 의 ⚠️ 주석).
 *
 * 그래서 매핑을 **이름 규칙**으로 바꾸고 그 규칙을 여기 한 곳에 둔다. 워크플로는
 * `toJSON(vars)` 로 저장소 Variables 전체를 받아 이 이름으로 찾아가므로, remote 가
 * 늘어도 YAML 은 한 글자도 안 바뀐다. 없는 키는 `jq -e` 가 **즉시 실패**시킨다.
 *
 * 규칙: 이름을 대문자로 올리고 `-` 를 `_` 로 바꾼다(`REMOTES` 키에 쓸 수 있는 문자 중
 * 셸 변수명에 못 들어가는 건 하이픈뿐이다).
 */
function envSlug(remote: RemoteName): string {
  return remote.toUpperCase().replace(/-/g, '_');
}

/** remote 의 공개 URL 이 담긴 저장소 Variable 이름 (예 `MF_CATALOG_URL`) */
export function ciUrlVar(remote: RemoteName): string {
  return `MF_${envSlug(remote)}_URL`;
}

/** remote 의 Dokploy 애플리케이션 id 가 담긴 저장소 Variable 이름 */
export function ciDokployAppVar(remote: RemoteName): string {
  return `DOKPLOY_APP_${envSlug(remote)}`;
}

/**
 * 배포 워크플로의 matrix 한 항목.
 *
 * 이름만 넘기면 워크플로가 다시 변수 이름을 조립해야 하고, 그러면 규칙이 두 곳에 산다.
 * 조립까지 끝낸 객체를 넘겨서 YAML 쪽에는 **규칙이 존재하지 않게** 한다.
 */
export interface RemoteDeployTarget {
  readonly name: RemoteName;
  readonly urlVar: string;
  readonly appVar: string;
  /** 이 경로 아래가 바뀌면 그 remote 를 배포한다 */
  readonly workspaceDir: string;
}

/**
 * host 의 워크스페이스 디렉터리.
 *
 * `REMOTES` 에는 host 가 없다 — host 는 remote 를 소비하는 쪽이라 배치가 다르다.
 * 그래도 "어느 경로가 바뀌면 host 를 배포하나" 는 배치 지식이라 여기 둔다.
 */
export const HOST_WORKSPACE_DIR = 'apps/host';

/**
 * 이 경로들이 바뀌면 **세 이미지 전부** 다시 빌드해야 한다.
 *
 * `.dockerignore` 가 목록에 있는 이유: 그 파일이 빌드 컨텍스트를 정하므로 이미지가
 * 통째로 달라진다. 빠뜨려서 배포가 안 물었던 적이 있다(known-issues I-7).
 */
export const SHARED_DEPLOY_PATHS: readonly string[] = [
  'packages/',
  'scripts/',
  'pnpm-lock.yaml',
  '.dockerignore',
];

export function deployTarget(remote: RemoteName): RemoteDeployTarget {
  return {
    name: remote,
    urlVar: ciUrlVar(remote),
    appVar: ciDokployAppVar(remote),
    workspaceDir: REMOTES[remote].workspaceDir,
  };
}

/** 로컬 개발 오리진. env 가 없을 때의 기본값들이 전부 여기서 나온다. */
export function devOrigin(remote: RemoteName): string {
  return `http://localhost:${REMOTES[remote].devPort}`;
}

/**
 * 브라우저 MF 런타임이 읽는 매니페스트 URL.
 *
 * 오리진은 env 에서, 파일명은 `MF_FILES` 에서 온다. **호출부가 경로를 조립하지 않는다** —
 * 조립을 밖에 두면 파일명이 그만큼 복제되고, 어긋났을 때 증상이 404 가 아니라
 * "폴백 응답을 파싱하다 실패" 라서 원인을 찾기 어렵다.
 */
export function webManifestUrl(remote: RemoteName): string {
  return `${publicOrigin(remote)}/${MF_FILES.webManifest}`;
}

/** host **서버**가 받아 실행하는 node 타깃 CJS 번들 URL */
export function ssrBundleUrl(remote: RemoteName): string {
  return `${publicOrigin(remote)}/${MF_FILES.ssrBundle}`;
}

/**
 * remote 가 컴파일한 CSS 의 **오리진 기준 상대 경로**.
 *
 * 위의 두 함수와 달리 오리진을 붙이지 않는다. 이 값을 쓰는 곳이 host 의 **브라우저
 * 번들**이기 때문이다 — 거기서는 `publicOrigin` 이 못 쓴다. 그 함수는 `process.env[이름]`
 * 을 동적으로 읽는데, Next 는 `process.env.리터럴` 형태만 빌드 타임에 치환하므로
 * 브라우저에서는 언제나 `devOrigin` 으로 떨어진다. 배포에서 remote CSS 를
 * `http://localhost:3001/...` 로 찾게 되고, 서버가 만든 HTML 과 값이 갈려
 * 하이드레이션까지 어긋난다.
 *
 * 그래서 오리진은 호출부가 붙인다. host 는 `next.config.ts` 가 구워 넣은 값에서 파생한
 * `REMOTE_ORIGINS` 를 쓴다(`apps/host/src/mf/remote-endpoints.ts`). `RemoteVersion` 의
 * `webEntry` · `ssrEntry` 도 같은 이유로 상대 경로다.
 *
 * `version` 이 없으면(dev) 버전 없는 경로로 떨어진다. dev 서버는 자산을 루트 경로로
 * 서빙하므로 그때는 그게 맞는 주소다.
 */
export function stylesPath(version?: string | null): string {
  return versionedPath(MF_FILES.styles, version);
}

/**
 * 이 remote 의 공개 오리진. 모든 remote 주소가 여기서 파생된다.
 *
 * ⚠️ `process.env[이름]` 으로 **동적 접근**한다. node 컨텍스트(스크립트·번들러 config·
 * `next.config.ts`·host 서버)에서는 그대로 동작하지만, **브라우저 번들에서 부르면
 * 치환되지 않아 언제나 `devOrigin` 으로 떨어진다.** 그게 문제가 되지 않도록 브라우저용
 * 값은 `next.config.ts` 가 node 에서 미리 꺼내 번들에 굽는다(`REMOTES` 주석 참고).
 *
 * `||` 인 이유: Dockerfile 에서 `ARG` 를 값 없이 선언하면 빈 문자열로 도착하는데,
 * `??` 는 그걸 유효한 설정으로 받아 `new URL("")` 에서 터진다.
 */
export function publicOrigin(remote: RemoteName): string {
  const configured = process.env[REMOTES[remote].env.publicUrl];
  return (configured || devOrigin(remote)).replace(/\/+$/, '');
}

/**
 * remote 의 SSR 번들이 **external 로 남기는** 모듈. host 가 자기 인스턴스를 주입한다.
 *
 * ## 왜 SSOT 여야 하나
 *
 * 이 목록은 원래 네 군데에 흩어져 있었다 — 두 remote 의 SSR 빌드 설정
 * (`vite.config.server.ts` 의 `rollupOptions.external`,
 * `rsbuild.server.config.ts` 의 `output.externals`), host 의 require 셰임
 * (`server-loader.ts` 의 `INJECTED`), 그리고 브라우저용 MF `shared`(`runtime.ts`).
 *
 * 어긋나는 방향이 둘이고 증상이 서로 다르다.
 *
 *   remote 가 external 로 안 남김 → React 가 서버에서 2벌이 된다. 훅이 깨진다.
 *   host 가 주입 안 함           → `remote 'x' 서버 번들이 예상 밖 모듈을 require 했습니다`
 *
 * 목록이 한 곳이면 둘 다 구조적으로 안 생긴다.
 *
 * ## 브라우저 `shared` 와는 다르다
 *
 * 브라우저 쪽은 **루트만** 공유한다(`runtime.ts` 주석 참고 — 서브엔트리까지 공유하면
 * 네임스페이스 모양이 갈려 `_jsxDEV is not a function` 이 난다). 서버 번들은 반대로
 * `require("react/jsx-runtime")` 을 그대로 호출하므로 서브엔트리도 넘겨야 한다.
 * 그래서 이 상수는 **서버 경로 전용**이고, 브라우저 `shared` 목록과 합치지 않는다.
 */
export const SSR_EXTERNALS = [
  'react',
  'react-dom',
  'react/jsx-runtime',
  'react/jsx-dev-runtime',
] as const;

/**
 * host 가 주입하는 셰임의 키 타입. **하나라도 빠지면 컴파일 타임에 걸린다** —
 * 빠진 채로 배포되면 `예상 밖 모듈을 require 했습니다` 로 remote 가 통째로 안 뜬다.
 */
export type SsrExternal = (typeof SSR_EXTERNALS)[number];

/**
 * 버전 디렉터리 아래의 경로. `/v<version>/<파일>` — **오리진은 붙이지 않는다.**
 *
 * 오리진을 안 붙이는 이유는 `stylesPath` 주석과 같다. 이 값을 쓰는 자리 중에
 * host 의 **브라우저 번들**이 있고, 거기서는 `publicOrigin` 이 못 쓴다.
 *
 * `version` 이 없으면(dev) 버전 없는 루트 경로로 떨어진다. dev 서버는 자산을 루트로
 * 서빙하므로 그때는 그게 맞는 주소다.
 */
export function versionedPath(file: string, version?: string | null): string {
  return version ? `/v${version}/${file}` : `/${file}`;
}

/**
 * 매니페스트 서명이 **덮는 필드**와 그 순서.
 *
 * ## 왜 여기 있나
 *
 * 서명하는 쪽(`scripts/stamp-remote-version.ts`)과 검증하는 쪽
 * (`apps/host/src/mf/remote-trust.ts`)이 이 배열을 각자 손으로 적고 있었다.
 * 주석으로 "양쪽이 같은 형식" 이라고 적어 사람이 지키는 계약이었다.
 *
 * 갈라졌을 때의 증상이 나쁘다. 매니페스트는 멀쩡히 만들어지고 배포도 성공하는데
 * **host 의 서명 검증만 실패**한다 — `MF_REQUIRE_SIGNATURE=1` 이면 remote 가 통째로
 * 안 뜨고, 아니면 조용히 서명 없이 통과한 것과 같아진다. 어느 쪽이든 원인이
 * 이 두 파일의 배열 차이라는 게 로그에 안 나온다.
 *
 * 서명은 host ↔ remote 배포 파이프라인 사이의 계약이므로 배치 SSOT 인 여기가 자리다.
 *
 * ## 왜 매니페스트 전체가 아닌가
 *
 * **신뢰 판단에 실제로 쓰이는 필드만** 고정 순서로 직렬화한다. 필드가 늘어도 서명이
 * 안 깨지게 하려는 게 아니라, 서명이 무엇을 보장하는지 읽는 사람이 한눈에 알게 하려는 것이다.
 * `contentHash` 같은 메타는 신뢰 판단에 안 쓰이므로 여기 없다.
 */
export interface SignedManifestFields {
  remote: string;
  version: string;
  ssrEntry: string;
  webEntry: string;
  ssrIntegrity?: string;
  webIntegrity?: string;
}

export function signedPayload(fields: SignedManifestFields): string {
  return JSON.stringify([
    fields.remote,
    fields.version,
    fields.ssrEntry,
    fields.webEntry,
    fields.ssrIntegrity ?? '',
    fields.webIntegrity ?? '',
  ]);
}
