---
paths:
  - 'apps/remote-catalog/**'
  - 'apps/remote-cart/**'
  - 'scripts/**'
---

# remote 앱(catalog · cart) 규칙

두 remote 는 **일부러 다른 번들러**다(catalog = Vite 8 + `@module-federation/vite`,
cart = Rsbuild 2 + `@module-federation/rsbuild-plugin`). 번들러 자유도가 이 저장소의 주장 중 하나라
한쪽으로 통일하지 않는다. 대신 **산출물 계약을 같게 맞춘다.**

## 산출물 계약

| 파일                                  | 무엇                                                          |
| ------------------------------------- | ------------------------------------------------------------- |
| `remoteEntry.js` · `mf-manifest.json` | 브라우저 MF 런타임용                                          |
| `mf-server.cjs`                       | host **서버**가 받아 실행하는 노드 번들                       |
| `style.css`                           | 이 remote 의 CSS 전부 (해시 없음, 루트)                       |
| `mf-version.json`                     | 버전 공표. 배포 경로는 `/v<version>/`                         |
| `@mf-types.zip` · `@mf-types.d.ts`    | MF DTS. host 가 `mf dts --fetch` 로 받아간다 (이 브랜치 한정) |

이름과 위치는 `MF_FILES` 가 정한다. 번들러 설정에서 출력 경로 · 파일명을 바꾸려면 **계약 쪽을
먼저** 본다. CSS 는 해시를 붙이지 않는다 — 주소를 host 가 계산으로 알아내야 하고, 캐시 무효화는
`/v<version>/` 불변 경로가 맡는다.

## dev 와 배포의 주소가 같아야 한다

host 는 dev 든 배포든 같은 모양의 URL 을 만든다. 그래서 dev 서버가 부족한 응답을 메꾼다.

- catalog: `/style.css` 를 `?direct` 로 변환해 `text/css` 로 응답(`serveDevStylesheet`).
  안 하면 Vite 가 CSS 를 JS 모듈로 주고 브라우저가 **에러 없이** 무시한다.
- catalog: `/mf-server.cjs` 는 디스크에서 읽어 내려주고, `mf-version.json` 은 **일부러 404** 다.
  dev 에서 버전을 공표하면 하지도 않은 배포를 알리게 되고 무결성 검사에서 죽는다.

dev 전용 미들웨어를 늘릴 때는 `configureServer`(dev)와 `configurePreviewServer`(preview) 훅
자체를 판별자로 쓴다. `NODE_ENV` · `command` 로는 구분이 안 된다.

## `exposes` 는 손으로 적지 않는다

`src/exposes/` 를 읽어서 만든다 — `readExposes(EXPOSE_SCAN.dir, { ignore: EXPOSE_SCAN.ignore })`
(`@mfa/remote-config/node`). 번들러가 둘이라 스캔을 각자 구현하면 "무엇이 expose 인가"가
remote 마다 갈린다. **인자도 `EXPOSE_SCAN` 한 곳에 있다** — 그 값을 대는 자리가 셋이라
(Vite 설정 · Rsbuild 설정 · `scripts/gen-module-ids.test.ts`) 갈리면 검사가 실제 빌드와
다른 것을 보게 된다. dev 가 볼 게 아닌 이웃 파일이 생기면 거기 `ignore` 에 줄을 하나 넣는다.

**`server-entry.ts` 의 SSR 진입점 맵은 손으로 적는다** — 정적 import 여야 번들이 갈리지
않는다. 그 맵이 스캔 결과와 같은지는 `src/server-entry.test.tsx` 가 본다. 빠뜨리면
브라우저에서는 되고 서버 렌더에서만 "expose 없음" 이 되는 비대칭이라, 늦게 잡히면 비싸다.

**대가는 파일 하나로 공개 계약이 바뀐다는 것이다.** 그래도 등록하는 자리는 없다 —
파일을 놓고 `pnpm mf:types` 를 돌리면 `MODULE_IDS` 까지 저절로 는다
(`scripts/gen-module-ids.ts` 가 DTS 에서 뽑는다). 그 목록은 **런타임 값**이다 —
타입은 DTS 가 준다(`packages/contracts/src/remote-contract.ts`).

검사는 세 갈래다.

| 무엇                            | 어디                              | 언제                   |
| ------------------------------- | --------------------------------- | ---------------------- |
| 스캔 규칙 자체                  | `remote-config/src/node.test.ts`  | `pnpm test`            |
| 커밋된 목록이 낡았나            | `scripts/gen-module-ids.test.ts`  | `pnpm test` — 오프라인 |
| 생성 목록 ≡ 공표한 `RemoteKeys` | `contracts/src/contract-check.ts` | `pnpm typecheck`       |

세 번째만으로는 부족하다 — **생성물끼리 비교**하므로 `pnpm mf:types` 를 안 돌리면 둘 다
낡은 채로 일치한다. 두 번째가 디스크의 `src/exposes/` 를 직접 보므로 그 창을 로컬에서
닫는다. 마지막 방어선은 CI 의 `pnpm mf:types` 후 `git diff` 다.

> 전에는 각 remote 의 `src/exposes/contract.test.ts` 가 이 대조를 했다. 그 테스트가
> `@mfa/contracts` 를 import 하는데 그 패키지가 MF DTS(= remote 빌드 산출물)를 읽게 되면서
> **remote 가 자기 산출물에 묶이는 순환**이 생겨 옮겼다.

## props 는 **이 remote 가 소유한다** (DTS 가 켜져 있다)

각 모듈의 props 인터페이스는 그 expose 파일 안에 선언하고 `export` 한다.
`@mfa/contracts` 로 올리지 않는다 — 올리는 순간 host 와 remote 가 같은 선언을 가리켜
DTS 가 전달할 정보가 0 이 되고, 계약이 어긋나도 아무것도 안 잡힌다(known-issues I-2).

```tsx
// src/exposes/ProductGrid.tsx
export interface ProductGridProps {
  category?: ProductCategory | 'all'; // ← 도메인 어휘는 @mfa/contracts 에서 온다
  onSelect?: (product: Product) => void;
}
export default function ProductGrid({ … }: ProductGridProps) { … }
```

경계가 둘이다. **어휘**(`Product` · `CartLine` · `ProductCategory`)는 host·remote·store 가
같이 쓰므로 계약 패키지, **표면**(props)은 이 remote 의 것이므로 구현 옆.

`@mfa/contracts` 에 남은 건 그 어휘와 **런타임 이름 목록**(`MODULE_IDS`)뿐인데,
그 목록도 생성물이다(`scripts/gen-module-ids.ts` 가 DTS 에서 뽑는다).
**모듈을 추가할 때 등록하는 자리가 없다** — 파일을 놓고 `pnpm mf:types` 만 돌린다.

### DTS 설정은 두 remote 가 같아야 한다

번들러가 달라도 host 는 같은 방식으로 소비한다.

```ts
dts: {
  generateTypes: { tsConfigPath: './tsconfig.json', typesFolder: MF_TYPES_FOLDER, … },
  consumeTypes: false,       // remote 는 다른 remote 를 소비하지 않는다
},
dev: { disableDynamicRemoteTypeHints: true },   // WS 플러그인만 끈다
```

산출물 이름은 `MF_TYPES_FOLDER` 와 `MF_FILES.typesApi` · `typesArchive` 가 정한다 —
host 가 받을 주소가 거기서 파생되므로 설정에 문자열을 다시 적지 않는다.

### props 를 고쳤으면 `pnpm mf:types` 를 돌린다

`@mfa/contracts` 가 커밋된 `@mf-types/` 를 읽는다(그래야 `pnpm typecheck` 가 네트워크
없이 돈다). 갱신을 잊으면 host 가 옛 타입으로 통과하는데, 그 창은 CI 가 `git diff` 로 닫는다.

**이 remote 는 `@mfa/contracts` 의 배럴만 쓴다.** `@mfa/contracts/remote` 를 import 하면
그 순간 remote 가 자기 빌드 산출물(`@mf-types`)을 요구하는 순환이 생긴다.
이 규칙은 각 remote 의 `eslint.config.js` 가 `no-restricted-imports` 로 막는다 —
어기면 결국 빌드가 죽지만 에러가 모듈 해석 실패로만 보여 원인을 안 가리킨다.

## dev 기동 순서

`scripts/wait-for-remotes.ts` 가 host 앞에 게이트를 건다. 단 **HTTP 200 만** 보므로 모듈 레벨
초기화 실패는 못 막는다. 60초 뒤에는 경고만 찍고 통과한다 — 로그에 `준비됨` 네 줄을 확인한다.

## remote 를 하나 더 추가할 때

배치의 원본은 `packages/remote-config` 하나다(ADR-017). 거기에 항목을 넣으면 **런타임 ·
스크립트 · 번들러 설정 · CI 배포 판별 · turbo env** 는 저절로 따라온다 — 손댈 곳이 없다.

손으로 해야 하는 건 아래 일곱 곳이고, **새 앱 디렉터리를 뺀 전부가 빠뜨리면 죽는다.**

| 무엇                                       | 안 하면                                                |
| ------------------------------------------ | ------------------------------------------------------ |
| `REMOTES` 에 항목 추가                     | `assertRemoteName` 이 거부한다                         |
| `apps/remote-<name>/` (번들러 설정 포함)   | —                                                      |
| `turbo.json` 의 `@mfa/host#build`          | `serve-all-remotes` 가 dist 없다고 죽는다              |
| 세 Dockerfile 의 `COPY … package.json`     | `docker-context.test.ts` 가 줄까지 알려준다            |
| `contract-check.ts` 의 `RemoteKeys` 유니온 | `pnpm typecheck` 이 죽는다                             |
| `apps/host/tsconfig.json` 의 `<name>/*`    | host 컴파일이 즉시 죽는다 (I-4 때문에 와일드카드 불가) |
| `packages/contracts/tsconfig.json` 도 같이 | 같음                                                   |

저장소 Variables 두 개도 필요하다 — 이름은 `ciUrlVar` · `ciDokployAppVar` 가 정한다.

```
MF_<NAME>_URL          공개 URL
DOKPLOY_APP_<NAME>     Dokploy 애플리케이션 id
```

없으면 배포 job 이 `jq -e` 에서 죽고 어느 변수가 없는지 말한다. **삼항으로 남의 remote
주소를 읽던 예전 방식이 조용히 틀리던 자리다**(I-11).

`docker-compose.yml` 과 `scripts/docker-host-local.sh` 는 로컬 검증 전용이라 손으로 맞춘다
(정적 YAML · 셸이라 SSOT 를 못 읽는다). 안 고쳐도 배포에는 영향이 없다.

## 컴포넌트를 하나 더 추가할 때

`src/exposes/` 에 파일을 놓고 `pnpm mf:types` 를 돌린다. 웹 `exposes` 는 스캔이라 등록할
자리가 없고, `MODULE_IDS` 는 DTS 에서 뽑힌다.

손으로 하는 건 둘이다.

| 무엇                                    | 안 하면                                                 |
| --------------------------------------- | ------------------------------------------------------- |
| `src/server-entry.ts` 의 맵             | `src/server-entry.test.tsx` 가 죽는다                   |
| host 의 `*Section` (+ 필요하면 `*Slot`) | 아무 데서도 안 쓰이는 모듈이 된다 — 의도한 것일 수 있다 |

`*Section` 을 레지스트리로 접지 않는다. props 타입이 module id 별로 오므로(`PropsOf<K>`)
제네릭 맵으로 접으면 그 타입이 통째로 죽는다.
