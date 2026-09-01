# 테스트 계획과 진척도

`pnpm build` 는 이 저장소의 유일한 주장("Next 16 에서 런타임 MF + remote SSR 이 된다")을 지키는
계약 테스트다. 강력하지만 **런타임 분기는 하나도 지키지 못한다.** 이 문서는 그 빈자리를 메우는
단위 · 통합 테스트의 목록이자 진척도다.

e2e 는 범위 밖이다. 브라우저를 띄워야만 알 수 있는 것은 여기서 다루지 않는다.

## 실행

| 명령                       | 하는 일                        |
| -------------------------- | ------------------------------ |
| `pnpm test`                | 전체 (`unit` + `dom` 프로젝트) |
| `pnpm test --project=unit` | Node 환경만                    |
| `pnpm test --project=dom`  | jsdom 환경만                   |
| `pnpm test:watch`          | watch 모드                     |
| `pnpm test:coverage`       | 커버리지 (v8)                  |
| `pnpm typecheck:tests`     | 테스트 코드 타입 검사          |

### CI 로그는 파일 한 줄씩만 찍는다

기본 리포터는 `slowTestThreshold`(기본 300ms)를 넘긴 테스트의 이름을 파일 줄 밑에 따로
나열한다. 러너 부하에 따라 300ms 언저리 테스트가 실행마다 들락거려서 **같은 커밋인데 로그
모양이 달라진다.** `vitest.config.ts` 가 CI 에서만 임계값을 올려 그 목록을 통째로 없앤다.

로컬은 기본값 그대로다 — 거기서는 그 목록이 "뭐가 느린가"를 짚어주는 신호다.
한 번 전부 보고 싶으면 `pnpm test --reporter=verbose`.

## 구조 — 테스트는 대상 소스 옆에 둔다

```
packages/store/src/cart/cookie-codec.ts
packages/store/src/cart/cookie-codec.test.ts   ← 바로 옆
```

**환경은 확장자로 가른다.** 디렉터리 규칙도, 접미사 규칙도 없다.

| 파일         | 환경  | 무엇을                                              |
| ------------ | ----- | --------------------------------------------------- |
| `*.test.ts`  | node  | 순수 로직, fetch/fs 모킹, Route Handler             |
| `*.test.tsx` | jsdom | DOM 이 필요한 것 전부 — 컴포넌트 · 훅 · 쿠키 저장소 |

대상이 `.ts` 여도 DOM 이 필요하면 테스트는 `.test.tsx` 다(`renderHook` 은 JSX 가 없어도 된다).
규칙이 하나뿐이라 파일을 열지 않고도 어느 환경에서 도는지 안다.

공유 자산만 루트 `tests/` 에 둔다.

```
tests/
  setup/dom.ts          jest-dom 매처 + RTL cleanup (dom 프로젝트 전용)
  helpers/globals.ts    globalThis 싱글턴 레지스트리 정리
  helpers/…             서명 키쌍, 가짜 req/res 등
```

테스트 파일에서는 `@tests/helpers/…` 로 부른다. 상대 경로로 쓰면
`../../../../tests/…` 가 되고 깊이가 파일마다 달라져서 파일을 옮길 때마다 깨진다.

### 두 가지 함정을 설정으로 막아뒀다

**① 테스트가 배포 산출물에 들어가는 것.** `packages/{store,contracts,ui}` 는 `dist` 로 emit 한다.
소스 옆에 테스트를 두면 그대로 컴파일돼 들어간다. 그래서 그 세 패키지만 tsconfig 를 둘로 나눴다.

| 파일                  | 누가 쓰나                         | 테스트   | emit 옵션                            |
| --------------------- | --------------------------------- | -------- | ------------------------------------ |
| `tsconfig.json`       | 편집기 TS 서버 · `pnpm typecheck` | 포함     | 없음(`noEmit`)                       |
| `tsconfig.build.json` | `build` · `dev` 스크립트          | **제외** | `outDir` · `rootDir` · `declaration` |

**테스트를 `tsconfig.json` 에서 빼면 안 된다.** 편집기의 TS 서버는 그 파일을 어느 프로젝트에도
넣지 못해 `@tests/*` 와 `@mfa/*` 를 통째로 못 찾는다(`ts(2307)`) — 러너는 멀쩡히 도는데
에디터만 빨갛게 되는 상태다. 한 번 그렇게 만들었다가 되돌렸다.

`rootDir` 도 `tsconfig.build.json` 쪽이다. 검사 프로그램에 두면 테스트가 루트 `tests/` 의
헬퍼를 import 하는 순간 `TS6059: not under rootDir` 로 죽는다.

emit 하지 않는 나머지(host · remote 둘 · remote-config)는 파일 하나로 충분하다 —
`@tests/*` paths 만 있으면 된다.

**② 빌드 없이 못 도는 것.** 워크스페이스 패키지의 `exports` 는 `./dist/*.js` 를 가리킨다.
`vitest.config.ts` 의 alias 가 `src` 를 직접 가리키므로 `pnpm build` 없이 돈다 —
turbo 태스크에 `^build` 를 걸 필요도 없다.

## 진척도

### Phase 0 — 인프라

- [x] 루트 `package.json` — devDependencies + `test` · `test:watch` · `test:coverage` · `typecheck:tests` 스크립트
- [x] `vitest.config.ts` — `test.projects` 로 `unit`(node) / `dom`(jsdom) 분리, 워크스페이스 alias
- [x] `tests/setup/dom.ts` — jest-dom 매처 + `afterEach(cleanup)` (globals 를 끄면 자동 cleanup 이 안 걸린다)
- [x] `tsconfig.test.json` — 루트 `tests/` 와 `vitest.config.ts` 검사
- [x] 패키지 tsconfig — 소스 옆 테스트를 **포함**하고, emit 하는 셋만 `tsconfig.build.json` 분리
- [x] 루트 `eslint.config.js` — `tests/**` 에 React 규칙 적용
- [x] `turbo.json` — `//#typecheck:tests` · `//#lint:tests` 루트 태스크.
      `test` 는 일부러 turbo 를 안 태운다 — 패키지별 대응 태스크가 없어 얻는 게 캐시뿐인데,
      그 대가로 `pnpm test --project=dom` 같은 러너 플래그가 turbo 에 먹힌다
- [x] `.github/workflows/ci.yml` — `pnpm test` 는 **`test` job 단독**. `verify`(lint · typecheck ·
      format:check) · `build` 와 의존 없이 동시에 돈다 — 체크 이름이 곧 실패 원인이다

### Phase 1 — 순수 로직 (node, 모킹 0)

- [x] 1. `packages/remote-config/src/index.ts` — `publicOrigin` env 폴백·후행 슬래시 / `versionedPath` falsy / `assertRemoteName` throw / **`signedPayload` 필드 순서** / `MF_FILES` 조립 불변식 / **`REMOTE_NAMES` 가 `REMOTES` 키 순서를 따른다**(ADR-017) / 포트·env 키 유일성
- [x] 2. `packages/contracts/src/product.ts` — `findProduct` / `formatKRW` / `PRODUCTS` 데이터 무결성
- [x] 3. `packages/contracts/src/remote-contract.ts` — `REMOTE_NAMES` ↔ `RemoteModuleMap` 접두사 일치 (계약 드리프트)
- [x] 4. `packages/store/src/cart/cookie-codec.ts` — 수량 강제변환·클램프 99·중복 병합·방어 파싱·퍼센트 디코딩 안 함·라운드트립
- [x] 5. `packages/store/src/cart/totals.ts` — 빈 배열 / 합계 / `Infinity`
- [x] 6. `packages/store/src/utils/global-singleton.ts` — create 1회 / 먼저 도착한 쪽이 이김 / name 격리
- [x] 7. `apps/host/src/lib/format-time.ts` — 3형태 입력 / KST +9h / 자정 `00` / TZ 무관
- [x] 8. `apps/host/src/lib/mf-secret.ts` — fail-closed / 길이 불일치 / 멀티바이트
- [x] 9. `apps/host/src/mf/loader/react-modules.ts` — `default` 언랩 / 미발견 시 원본 + dev 경고
- [x] 10. `apps/host/src/mf/state/cell.ts` · `state/loader-stats.ts` — 셀 재사용 / 카운터 / **얕은 복사 방어** / reset
- [x] 11. `apps/host/src/components/lab/modes.ts` — 순수 상수·매핑

### Phase 2 — 신뢰 경계 (node, WebCrypto 실물)

- [x] 12. `apps/host/src/mf/trust/index.ts` — `allowedOrigins` / `assertAllowedOrigin` / `assertSafeVersion`(`</script>` 주입, 64자, 선두 `.`) / `assertSafeEntryPath`(절대 URL, `//evil`, `..`, `?#`, 버전 불일치) / SHA-384 고정 벡터 / `assertIntegrity` 4분기 / `integrityRequired`·`signatureRequired` 진리표
- [x] 13. **서명 계약 라운드트립** — `signedPayload`(remote-config) → Ed25519 서명(`node:crypto`) → `assertManifestSignature`(host, WebCrypto). 15차에 실제로 갈라졌던 자리

### Phase 3 — 모킹 통합 (node)

- [x] 14. `apps/host/src/mf/versions/server.ts` — `announcedVersion` 저장/조회 / `fetchRemoteVersion` 6분기
- [x] 15. `apps/host/src/mf/loader/server.ts` — id 파싱 / 오리진·HTTP·타임아웃·무결성 분기 / requireShim / `default` 언랩 / 통계 순서 / 캐시(재사용·재로드·**실패 promise 제거**)
- [x] 16. `apps/host/src/app/api/mf-revalidate/route.ts` — 401 / 400 / `warm=0` / 502 + **태그 미무효화** / `cause` 언래핑 / 성공 호출 순서 / `paths=1`
- [x] 17. `apps/host/src/proxy.ts` — 시크릿 없으면 **401 이 아니라 404** / `config.matcher` / `/api/lab/*` 은 **DELETE 만** 프로덕션에서 닫힘
- [x] 18. `apps/host/src/lib/cart-cookie.ts` — 쿠키 없음 → `[]` / 이중 디코딩 안 함
- [x] 19. `apps/host/src/app/api/lab/stats/route.ts` — `refresh=1` 일 때만 fetch / **버전이 바뀐 remote 만 태그 만료**(24차) / 응답 형태 / `DELETE` / **배포본에서 DELETE 는 404** (proxy 와 별개의 이중 방어)
- [x] 20. `apps/host/src/mf/config/index.ts` — `MFA_REMOTE_WEB_ENTRIES` 파싱 실패 삼킴 / 주입 / `WEB_ORIGINS`
- [x] 20b. `apps/host/src/mf/versions/browser.ts` — 심어준 값 없음 → `undefined` / remote 별 격리 / **전역 이름이 `RemoteVersionSync` 와 같다**(24차 회귀)
- [x] 20c. `apps/host/src/mf/versions/index.ts` — `remoteVersion` 4분기(공표만 / 심어준 것만 / 양쪽 없음 / remote 별 격리)
- [x] 20d. `apps/host/src/mf/state/warm.ts` — 적재 전/후 · **epoch 불일치 → false** · 공표≠적재 · warm 세대 증가
- [x] 21. `packages/remote-config/src/node.ts` — `readBuildVersion` / `assetBase` 4조합 / `createMfDevMiddleware` 상태코드·헤더·dev↔preview 차이

### Phase 4 — DOM (jsdom + RTL)

- [x] 22. `packages/store/src/utils/cookie-storage.ts` — `readCookie` / `secure` 프로토콜 추론 / **4096B 예산** / 되읽기 검증 / `removeItem`
- [x] 23. `packages/store/src/cart/cookie-storage.ts` — 설정값 · codec 위임
- [x] 24. `packages/store/src/cart/create-store.ts` — `add` 투영 / `setQuantity` 0·음수 → 삭제 / **`add` 에 99 상한 없음(codec 과 비대칭)**
- [x] 25. `packages/store/src/hooks/use-revalidate-on-focus.ts` — visibility 가드 / **ref latest** / cleanup
- [x] 26. `use-hydrated.ts` · `use-cart-lines.ts` — `renderToString` SSR 경로 / 클라이언트 전환
- [x] 27. `packages/store/src/cart/use-cart-sync.ts` — 기준선 3-상태 / 동일 원문 스킵 / **정규화 후 reseed**
- [x] 28. `packages/ui/src/components.tsx` — `--hue` 변수 / 조건부 렌더 / variant 클래스 매핑
- [x] 29. `apps/host/src/mf/components/RemoteBoundary.tsx` — 자식 throw → `ErrorBox` 내용
- [x] 30. `apps/host/src/mf/components/RemoteComponent.tsx` — Skeleton → 마크업 전이 / `<link href>` 조립 / **브라우저는 심어준 버전을 본다**(24차, `globalCell` 없이 불변 경로) / 실패 시 Boundary
- [x] 31. remote exposes — cart 3종 · catalog 4종. props 계약 + 콜백. **remote 는 host 라우터를 모른다**(ADR-013)
- [x] 32. host 컴포넌트 — `SiteHeader` · `MfDiagnostics` · `lab/*`

### Phase 5 — 테스트를 위한 최소 추출 (프로덕션 파일 수정)

- [x] 33. `scripts/serve-remote-dist.ts` → `createHandler(dist)` 추출. **경로 탈출 방어**(`%2e%2e%2f` 포함) / `/v*/` 캐시 헤더 / MIME
- [x] 34. `scripts/wait-for-remotes.ts` → `remoteEntryUrl` 추출. `publicPath` 절대·`auto`·누락 / 슬래시 트리밍
- [x] 35. `scripts/stamp-remote-version.ts` → `integrity()` · payload 조립 · **정리 대상 경계**(현재 버전만 남긴다 / `v` 접두사 밖은 안 건드린다) 추출
- [x] 36. `apps/host/src/app/api/mf-revalidate/route.ts` → `selfOrigin()` export
- [x] 37. `apps/host/src/mf/components/RemoteComponent.tsx` → `remoteCacheKey()` export. 브라우저에서도 버전이 키에 들어가는지 같이 본다(24차)
- [x] 38. `apps/remote-*/src/exposes/contract.test.ts` — 디렉터리 스캔 결과 ≡ `@mfa/contracts` 의
      `MODULE_IDS`. **파일만 추가하고 props 타입을 안 적은 경우**와 그 반대를 둘 다 잡는다
      (`Drift.tsx` 로 실패 실증). `exposes` 를 스캔으로 만들면서 생긴 위험을 여기서 막는다

## 테스트하지 않는 것

| 대상                                                | 이유                                                                                                                                         |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/host/src/mf/components/RemoteVersionSync.tsx` | `'use cache'` 는 Next 컴파일러가 변환하는 디렉티브다. 변환 없이 실행하면 `cacheLife`/`cacheTag` 가 캐시 스코프 밖 호출로 throw. **e2e 영역** |
| 실제 MF 런타임 로딩 · host 프리렌더                 | `pnpm build` 가 이미 계약 테스트로 커버한다 (CI `build` job)                                                                                 |
| `scripts/gen-signing-key.ts`                        | 로직이 없다. 키 형식만 `tests/helpers/signing.ts` 로 옮겨 픽스처 생성에 쓴다                                                                 |
| `scripts/mf-build-version.ts`                       | `t${Date.now().toString(36)}` 한 줄                                                                                                          |
| 브라우저 실제 동작                                  | e2e 범위                                                                                                                                     |

## 테스트를 쓸 때 반드시 지킬 것

이 저장소에는 테스트를 조용히 오염시키는 자리가 네 군데 있다.

1. **모듈 top-level 에서 env 를 캡처한다** — `apps/host/src/mf/config/index.ts` 는 import 시점에
   env 를 읽고 `new URL()` 로 오리진을 조립한다. 즉 잘못된 값이면 **모듈 로드 자체가 throw** 한다.
   env 를 바꾸는 테스트는 반드시 `vi.stubEnv` → `vi.resetModules()` → `await import()` 순서여야 한다.
   이 모듈은 `versions/server` · `loader/server` · `loader` · `RemoteComponent` 가 전부 전이 의존한다.

2. **globalThis 오염** — `globalCell`(host) 과 `globalSingleton`(store) 은 `Symbol.for` 레지스트리라
   `vi.resetModules()` 로 안 지워진다. `tests/helpers/globals.ts` 의 `clearGlobalRegistries()` 를
   `beforeEach` 에서 부른다.

3. **모듈 스코프 가변 상태** — `loader/server.ts` 의 `bundleCache`, `loader/index.ts` 의 `clientCache` ·
   `initialized`, `components/RemoteComponent.tsx` 의 `lazyCache`, `utils/cookie-storage.ts` 의 `warned: Set`.
   리셋 API 가 없어 `vi.resetModules()` + 동적 import 로만 격리된다.

4. **ICU 로케일 의존** — `formatKRW`(`toLocaleString('ko-KR')`)와 `formatKst`(`Intl.DateTimeFormat`)의
   출력은 Node 의 ICU 데이터에 좌우된다. 문자열 스냅샷 대신 계산값과 구조를 단언한다.

그리고 **순수 codec 테스트는 `@mfa/store/server` 로 import 한다.** 배럴 `@mfa/store` 를 타면
`create-store` · `use-cart-sync` 의 top-level 싱글턴이 같이 생성된다.

## 근거 버전

- Vitest **4.1.11** (npm registry, 2026-08-18 배포). v4 에서 별도 `vitest.workspace.ts` 는 없어졌고
  루트 config 의 `test.projects` 배열로 대체됐다 — context7 `/vitest-dev/vitest/v4.1.6`
  `docs/guide/projects.md` 조회 결과.
- jsdom 30.0.1 / @testing-library/react 16.3.2 / @testing-library/dom 10.4.1 /
  @testing-library/jest-dom 7.0.1 / @vitejs/plugin-react 6.0.5.
- 검증일: 2026-08-31. Node v24.19.0, pnpm 12.1.0 (619개 전부 통과).
