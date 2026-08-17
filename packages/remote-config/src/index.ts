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
} as const;

/**
 * remote 이름. host 가 `catalog/ProductGrid` 처럼 이 이름으로 모듈을 지목한다.
 *
 * `@mfa/contracts` 가 이 값을 재-export 한다. 소비처는 그쪽 이름으로 계속 import 해도 되고,
 * 여기가 원본이다.
 */
export const REMOTE_NAMES = ['catalog', 'cart'] as const;
export type RemoteName = (typeof REMOTE_NAMES)[number];

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

export interface RemoteDefinition {
  readonly name: RemoteName;
  readonly packageName: string;
  /** 리포지터리 루트 기준 경로. 스크립트가 dist 위치를 파생할 때 쓴다. */
  readonly workspaceDir: string;
  /** dev 서버 · `pnpm start` 정적 서버가 잡는 포트 */
  readonly devPort: number;
  readonly env: RemoteEnvKeys;
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
 * `satisfies` 가 **`REMOTE_NAMES` 와의 불일치를 컴파일 타임에 잡는다.** 이름만 추가하고
 * 정의를 빠뜨리면 여기서 에러가 난다 — remote 추가가 반쯤 된 채로 넘어가지 못한다.
 */
export const REMOTES = {
  catalog: {
    name: 'catalog',
    packageName: '@mfa/remote-catalog',
    workspaceDir: 'apps/remote-catalog',
    devPort: 3001,
    env: {
      publicUrl: 'REMOTE_CATALOG_PUBLIC_URL',
    },
  },
  cart: {
    name: 'cart',
    packageName: '@mfa/remote-cart',
    workspaceDir: 'apps/remote-cart',
    devPort: 3002,
    env: {
      publicUrl: 'REMOTE_CART_PUBLIC_URL',
    },
  },
} as const satisfies Record<RemoteName, RemoteDefinition>;

/** 순회용. `REMOTE_NAMES` 순서를 따른다. */
export const REMOTE_LIST: readonly RemoteDefinition[] = REMOTE_NAMES.map(
  (name) => REMOTES[name],
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
