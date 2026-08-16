# `@module-federation/dts-plugin` 도입 검토

검토일: 2026-08-14 · 버전 **2.8.2** · **검토만 수행, 저장소 설정 변경 없음**

3차 작업에서 `[ dynamic-remote-type-hints-plugin ] err: [object Event]` 때문에
두 remote 의 `dts` 를 껐다. 그게 과했는지, 제대로 쓰면 얻는 게 있는지 다시 본다.

## 요약 (결론 먼저)

| 질문                                                | 답                                                                                              |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| 콘솔 에러 때문에 `dts` 를 꺼야만 했나?              | **아니다.** 에러는 `dev` 옵션 소관이다. `dev.disableDynamicRemoteTypeHints: true` 로 끌 수 있다 |
| 번들러 플러그인 없는 host 가 타입을 소비할 수 있나? | **가능하다.** `mf dts --fetch` CLI 로 검증 완료                                                 |
| 지금 도입할 가치가 있나?                            | **없다.** 우리 구조에서는 커버리지가 절반이고 CI 비용이 크다                                    |
| 대신 뭘 할까?                                       | remote 안에서 `RemoteModuleMap` 준수를 컴파일 타임에 강제 (도구 0개 추가)                       |

## 1. 콘솔 에러의 진짜 스위치는 `dts` 가 아니라 `dev` 다

`DevPlugin.apply()` 실물:

```js
// @module-federation/dts-plugin/dist/index.js
apply(compiler) {
  const { _options: { name, dev, dts } } = this;
  const normalizedDev = normalizeOptions(true, {
    disableLiveReload: true,
    disableHotTypesReload: false,
    disableDynamicRemoteTypeHints: false,      // ← 기본 false = 켜짐
  }, 'mfOptions.dev')(dev);

  if (!isDev() || normalizedDev === false) return;      // ← dev 빌드에서만
  ...
  if (!normalizedDev.disableDynamicRemoteTypeHints) {
    this._options.runtimePlugins.push(
      path.resolve(__dirname, 'dynamic-remote-type-hints-plugin.js')   // ← WS 플러그인 주입
    );
  }
```

즉 WS 런타임 플러그인은 **`dev` 축**이다. `dts: false` 로 사라진 건
`DtsPlugin` 이 통째로 안 붙으면서 그 안의 `DevPlugin` 도 같이 빠졌기 때문이지,
`dts` 가 원인이어서가 아니다.

DTS 를 유지하면서 콘솔 에러만 없애려면:

```ts
federation({
  dts: true, // 켠 채로
  dev: { disableDynamicRemoteTypeHints: true }, // WS 만 끔
});
```

### 실측으로 확인

catalog remote 설정을 임시로 바꿔가며 **dev 서버가 실제로 서빙하는 모듈 그래프**를 스캔했다.
(프로덕션 `dist/` 가 아니라 `http://localhost:3001/remoteEntry.js` 부터 import 를 따라감)

| 설정                                                    | `dynamic-remote-type-hints` 주입             | DTS 생성 로그                       |
| ------------------------------------------------------- | -------------------------------------------- | ----------------------------------- |
| `dts: true` (기본)                                      | **있음** — `/remoteEntry.js` + 플러그인 모듈 | `Federated types created correctly` |
| `dts: true` + `dev.disableDynamicRemoteTypeHints: true` | **없음**                                     | `Federated types created correctly` |
| `dts: false` (현재 저장소)                              | 없음                                         | 없음                                |

**따라서 "DTS 를 쓰려면 콘솔 에러를 감수해야 한다"는 전제는 틀렸다.**
현재 `dts: false` 는 여전히 유효한 선택이지만, 근거는 콘솔 에러가 아니라 아래 3~5번이다.

> ⚠️ 3차 작업에서 근거로 든
> `grep -c 'dynamic-remote-type-hints' apps/*/dist/remoteEntry.js → 0` 은 **무효한 검증이었다.**
> `dist/` 는 프로덕션 산출물이고 이 플러그인은 `isDev()` 가드 때문에
> 프로덕션 번들에 애초에 들어가지 않는다. `dts` 값과 무관하게 항상 0 이다.

## 2. 산출물 실측 — remote 쪽

저장소 설정을 건드리지 않고 `generateTypes()` 를 스크래치 디렉터리로 직접 돌려봤다.

```
dts-out/
├── @mf-types.zip                                   ← host 가 받아갈 압축본
├── @mf-types.d.ts                                  ← API 타입 (RemoteKeys / PackageType)
└── @mf-types/
    ├── ProductGrid.d.ts                            ← 재수출 껍데기
    ├── ProductDetail.d.ts
    └── compiled-types/src/exposes/ProductGrid.d.ts ← 실제 시그니처
```

실제 시그니처:

```ts
// compiled-types/src/exposes/ProductGrid.d.ts
import { type ProductGridProps } from '@mfa/contracts';
export default function ProductGrid({
  category,
  onSelect,
}: ProductGridProps): import('react').JSX.Element;
```

**여기서 이미 핵심이 드러난다.** 생성된 타입이 `@mfa/contracts` 를 그대로 import 한다.
remote 의 props 타입이 애초에 우리 계약 패키지에서 온 것이기 때문이다.
즉 **DTS 가 알려주는 정보의 대부분을 host 는 이미 알고 있다.**

> 참고: 다른 저장소의 독립 remote 라면 이 import 가 깨진다.
> 그때는 `extractThirdParty: true` 로 서드파티 타입까지 인라인해야 한다.

## 3. 산출물 실측 — host 쪽 (번들러 플러그인 없이)

`@module-federation/dts-plugin` 에는 bin 이 없지만, **`@module-federation/enhanced` 가
`mf` CLI 를 제공한다.**

```
$ mf dts --help
Options:
  --fetch <boolean>     fetch types from remote, default is true
  --generate <boolean>  generate types, default is true
  -c --config <config>  configuration file
  --output <output>     generated dts output directory
```

스크래치에서 PoC 를 돌렸다. remote 의 zip 을 4321 포트로 서빙하고,
host 역할 디렉터리에 config + tsconfig 만 두고 실행:

```js
// module-federation.config.cjs
module.exports = {
  name: 'host',
  remotes: { catalog: 'catalog@http://localhost:4321/mf-manifest.json' },
  dts: {
    generateTypes: false,
    consumeTypes: {
      remoteTypeUrls: {
        catalog: {
          alias: 'catalog',
          api: 'http://localhost:4321/@mf-types.d.ts',
          zip: 'http://localhost:4321/@mf-types.zip',
        },
      },
    },
  },
};
```

```
$ mf dts --fetch true --generate false -c module-federation.config.cjs
[ Module Federation DTS ] Federated types extraction completed
```

결과:

```
@mf-types/
├── index.d.ts
└── catalog/
    ├── apis.d.ts
    ├── ProductGrid.d.ts
    ├── ProductDetail.d.ts
    └── compiled-types/src/...
```

`index.d.ts` 가 흥미롭다. **우리가 쓰는 바로 그 패키지를 모듈 확장한다.**

```ts
declare module '@module-federation/runtime' {
  type RemoteKeys = 'catalog/ProductGrid' | 'catalog/ProductDetail';
  export function loadRemote<T extends RemoteKeys, Y>(
    packageName: T,
  ): Promise<PackageType<T, Y>>;
}
```

**번들러 플러그인 없는 host 도 타입 소비가 된다는 건 검증됐다.**

주의: `apis.d.ts` 가 `typeof import('catalog/ProductGrid')` 처럼 **bare specifier** 를 쓴다.
host tsconfig 에 매핑을 넣지 않으면 해석되지 않는다.

```jsonc
"paths": { "*": ["./@mf-types/*"] }
```

## 4. 우리 구조에서의 실제 커버리지 — 절반뿐

DTS 가 타입을 붙여주는 대상은 `loadRemote()` 다. 그런데 우리 host 는 이렇게 생겼다.

```ts
export function loadRemoteModule<K extends RemoteModuleId>(
  id: K,
): Promise<RemoteModuleMap[K]> {
  if (typeof window === 'undefined') return loadRemoteModuleOnServer(id); // ← 우리 코드
  return loadOnClient(id); // ← loadRemote()
}
```

| 경로                                                | DTS 적용                 |
| --------------------------------------------------- | ------------------------ |
| 브라우저 (`loadRemote`)                             | ⭕ 모듈 확장이 먹는다    |
| 서버 (`server-loader.ts` 의 fetch + `new Function`) | ❌ MF 가 존재조차 모른다 |

SSR 경로는 우리가 직접 만든 로더다. DTS 는 여기에 아무 타입도 못 준다.
그런데 **호출부는 `loadRemoteModule` 하나로 통일돼 있어서**, 결국 타입은
`RemoteModuleMap` 이 결정한다. DTS 를 붙여도 그 위에 덧씌워지지 않는다.

즉 DTS 를 도입해도 **`@mfa/contracts` 를 대체할 수 없다.** 검증 장치로만 쓸 수 있다.

## 5. 도입 비용

| 항목             | 내용                                                                                        |
| ---------------- | ------------------------------------------------------------------------------------------- |
| host 파이프라인  | `module-federation.config` + `mf dts --fetch` 실행 스크립트 + turbo task 추가               |
| tsconfig         | `paths: { "*": ["./@mf-types/*"] }`                                                         |
| .gitignore       | `@mf-types`, `@mf-types.zip`                                                                |
| **CI 순서 의존** | `consumeTypes` 는 zip 을 **HTTP 로** 받는다. typecheck 전에 remote 가 **떠 있어야** 한다    |
| dev 노이즈       | `dev.disableDynamicRemoteTypeHints: true` 필수                                              |
| 빌드 시간        | remote 마다 tsc 한 번 더 (`compileInChildProcess`)                                          |
| 실패 모드        | remote 미기동 시 타입 소실 → `abortOnError` 를 켜면 CI 가 깨지고, 끄면 조용히 `any` 가 된다 |

CI 순서 의존이 제일 크다. 지금은 `pnpm typecheck` 가 네트워크 없이 도는데,
DTS 를 붙이면 **타입 검사에 remote 서버 기동이 전제**가 된다.

## 6. 대안 — 같은 이득, 비용 0

DTS 로 잡고 싶은 건 결국 **계약 드리프트**다. 우리 실패 모드 1순위는
"remote 의 expose 키/시그니처가 `RemoteModuleMap` 과 어긋나는 것"이고,
그래서 `/debug` 페이지까지 만들었다.

이건 remote 안에서 컴파일 타임에 강제할 수 있다. 도구 추가 0개, 네트워크 0회.

```ts
// apps/remote-catalog/src/server-entry.ts (개념)
import type { RemoteModuleMap } from '@mfa/contracts';

/** `catalog/X` 계약 키 → `./X` expose 키 매핑을 타입으로 강제 */
type CatalogExposes = {
  [K in Extract<
    keyof RemoteModuleMap,
    `catalog/${string}`
  > as K extends `catalog/${infer N}`
    ? `./${N}`
    : never]: RemoteModuleMap[K]['default'];
};

const exposes: CatalogExposes = {
  './ProductGrid': ProductGrid,
  './ProductDetail': ProductDetail,
};
```

이러면 다음이 전부 **remote 자신의 `pnpm typecheck` 에서** 걸린다.

- 계약에 있는 expose 를 빠뜨림 → 누락 에러
- 계약에 없는 키를 노출 → 초과 프로퍼티 에러
- props 시그니처 불일치 → 할당 불가 에러

DTS 가 주는 검증의 대부분을, 네트워크와 CI 순서 의존 없이 얻는다.
`server-entry.ts` 가 이미 모든 expose 를 import 하고 있어서 추가 파일도 필요 없다.

남는 빈틈은 "웹 빌드의 `exposes` 설정과 `server-entry.ts` 맵이 어긋나는 경우"인데,
이건 `/debug` 의 manifest 프로브가 런타임에 잡는다.

## 7. 판정

**도입 보류.** 근거:

1. DTS 는 `RemoteModuleMap` 을 대체하지 못한다. SSR 로더 경로를 모른다
2. 우리 remote 의 props 타입이 이미 `@mfa/contracts` 에서 나온다 — 정보가 중복이다
3. typecheck 에 remote 기동을 요구하는 CI 순서 의존이 가장 큰 비용이다
4. 얻고 싶은 드리프트 검증은 6번 방식으로 비용 없이 얻을 수 있다

**재검토 조건** — 아래 중 하나라도 참이 되면 다시 본다.

- remote 가 **다른 저장소/다른 팀**으로 나가서 `@mfa/contracts` 를 공유할 수 없게 될 때
  (그때는 `extractThirdParty: true` 와 함께 DTS 가 사실상 유일한 계약 전달 수단이다)
- host 가 SSR 로더를 버리고 `loadRemote()` 단일 경로로 돌아갈 때
- remote 수가 늘어 손으로 관리하는 `RemoteModuleMap` 이 병목이 될 때

**지금 바로 고칠 것은 없다.** 다만 문서상 `dts: false` 의 근거를
"콘솔 에러 때문"에서 "정보 중복 + CI 비용 때문"으로 정정해 둔다.

## 부록 — 검토 중 확인한 사실

| 항목                                 | 값                                                                                  |
| ------------------------------------ | ----------------------------------------------------------------------------------- |
| `@module-federation/dts-plugin` peer | `typescript ^4.9 \|\| ^5 \|\| ^6 \|\| ^7` (우리 6.0.3 OK)                           |
| bin                                  | 없음. CLI 는 `@module-federation/enhanced` 의 `mf`                                  |
| exports                              | `.`, `./core`, `./dynamic-remote-type-hints-plugin`                                 |
| 프로그래매틱 API                     | `generateTypes()`, `consumeTypes()`, `generateTypesInChildProcess()` (from `/core`) |
| WS 플러그인 주입 조건                | `isDev()` (= `NODE_ENV === 'development'`) && `!dev.disableDynamicRemoteTypeHints`  |
| 주입 주체                            | `DtsPlugin` 이 아니라 그 안에서 적용되는 `DevPlugin`                                |
| host 소비 방법                       | `mf dts --fetch true --generate false -c <config>` (PoC 성공)                       |
| host tsconfig 요구                   | `paths: { "*": ["./@mf-types/*"] }`                                                 |

## 출처

- [Module Federation — dts 설정 문서](https://module-federation.io/configure/dts)
- [DeepWiki — DTS Plugin Architecture](https://deepwiki.com/module-federation/core/4.1-dts-plugin-system)
- [DeepWiki — Type Consumption Flow](https://deepwiki.com/module-federation/core/4.3-type-consumption-flow)
- [module-federation/core#4291 — consumeTypes: false 시 moduleFederationConfig 필요](https://github.com/module-federation/core/issues/4291)
- [module-federation/core#3573 — production 에서 remote 타입 fetch 요청](https://github.com/module-federation/core/issues/3573)
- [module-federation/core#4744 — manifest URL 일 때 zipUrl 오산출 버그](https://github.com/module-federation/core/issues/4744)
