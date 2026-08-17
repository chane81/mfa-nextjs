# 환경변수

**로컬 개발에는 아무것도 설정하지 않아도 된다.** 기본값이 `packages/remote-config` 에 코드로 있다.

이 문서는 "바꿔야 할 때 **무엇을 어디에** 적는가"를 다룬다. 실행 방법은
[01-getting-started.md](./01-getting-started.md), 배포 값 주입은
[04-dokploy.md](./04-dokploy.md), 보안 변수의 의미는
[04-remote-lifecycle.md](../02-architecture/04-remote-lifecycle.md#운영-레퍼런스) 를 본다.

> `.env.example` 을 두지 않는다. 이 저장소는 필수 변수가 0개라 예제 파일이 "복사하면 되는 것"
> 처럼 보이는 게 오히려 틀린 신호다. 게다가 아래에서 보듯 **파일을 어디에 두느냐가 동작을
> 좌우해서**, 값 목록만 있는 파일로는 그 절반도 전달되지 않는다.

## `.env` 파일이 실제로 로드되는 자리는 한 곳뿐

앱마다 번들러가 다르다(host=Next/Turbopack, catalog=Vite, cart=Rsbuild). **env 파일 로딩은
번들러가 하는 일이라 앱마다 다르게 동작한다.** 파일을 만들어 두고 값이 안 먹어서 헤매기 쉬운
지점이라 먼저 적는다.

| 위치                          | 로더                 | 로드됨?            | 근거                                  |
| ----------------------------- | -------------------- | ------------------ | ------------------------------------- |
| `apps/host/.env.local`        | Next.js              | ✅                 | `next.config.ts` 평가 시점에도 보인다 |
| `apps/remote-cart/.env.local` | Rsbuild CLI (dotenv) | ✅ (권장하지 않음) | 실측 확인 — 아래                      |
| `apps/remote-catalog/.env*`   | Vite 8               | ❌                 | 설계상 `process.env` 에 안 넣는다     |
| 루트 `.env`                   | turbo 2              | ❌                 | 캐시 키로만 쓴다                      |
| `scripts/*.ts`                | 없음                 | ❌                 | 별도 node 프로세스                    |

실질적으로 **`apps/host/.env.local` 하나만 쓴다.** 나머지는 셸 환경변수로 준다.

### host — 동작한다

Next.js 가 `.env.local` 을 자동 로드하고, `next.config.ts` 평가 전에 로드하므로
`NEXT_PUBLIC_*` 치환까지 파일에서 먹는다.

### catalog(Vite 8) — 동작하지 않는다

`vite.config.ts` 는 `publicOrigin()` 을 통해 config 평가 시점에
`process.env.REMOTE_CATALOG_PUBLIC_URL` 을 읽는다. 그런데 Vite 는 그 시점에 `.env*` 를
로드하지 않았다.

> Vite deliberately defers loading `.env*` files until after the user config has been resolved,
> as the set of files to load depends on config options like `root` and `envDir`, and also on the
> final `mode`. This means variables defined in `.env` files are not automatically injected into
> `process.env` while `vite.config.*` is running.
> — Vite 8.0.10, `docs/config/index.md`

읽을 파일 목록 자체가 config 에 달려 있으니 config 보다 먼저 읽을 수 없다는, 피할 수 없는
순서 문제다. 최종적으로도 `VITE_` 접두사 값만 `import.meta.env` 로 노출되고 `process.env` 는
끝까지 채워지지 않는다.

그래서 catalog 의 자산 오리진은 **셸 환경변수로만** 바뀐다.

```bash
REMOTE_CATALOG_PUBLIC_URL=https://cdn.example.com pnpm --filter @mfa/remote-catalog build
```

파일로 받고 싶으면 `vite.config.ts` 에서 `loadEnv(mode, process.cwd(), '')` 를 직접 호출해
결과를 써야 한다. **하지 않았다** — 아래 "왜 remote 는 파일을 안 쓰나" 참고.

### cart(Rsbuild 2) — 동작하지만 쓰지 않는다

Rsbuild CLI 는 dotenv 로 `.env*` 를 읽어 `process.env` 에 넣고, 그 뒤에 config 를 로드한다.
`rsbuild.config.ts` 의 `publicOrigin()` 이 값을 그대로 받는다. 실측:

```bash
# apps/remote-cart/.env.local 에 REMOTE_CART_PUBLIC_URL=http://envtest.local:9999
$ npx rsbuild inspect
dist/.rsbuild/rsbuild.config.mjs:80:  assetPrefix: 'http://envtest.local:9999',
dist/.rsbuild/rspack.config.web.mjs:29: publicPath: 'http://envtest.local:9999/',
```

**동작하지만 파일을 두지 않는다.** catalog 는 같은 파일이 안 먹으므로, cart 만 파일로 설정하면
두 remote 의 설정 방법이 갈린다. 양쪽 다 셸 env 로 통일하는 편이 헷갈릴 여지가 없다.

### 루트 `.env` — 로드되지 않는다

turbo 2 에는 dotenv 로딩이 없다(v1 기능이 제거됐다). `turbo.json` 의
`globalDependencies: [".env"]` 는 **캐시 키**다 — 파일이 바뀌면 캐시가 깨지지만 값이 태스크
환경으로 주입되지는 않는다.

### scripts — 셸 env 전용

`scripts/*.ts` 는 `node scripts/….ts` 로 도는 별도 프로세스라 어떤 `.env` 도 보지 않는다.
아래 표에서 "설정 위치 = 셸"인 값들이 여기 해당한다.

```bash
MF_SIGNING_KEY=$(cat key.b64) pnpm --filter @mfa/remote-cart build
WAIT_FOR_REMOTES_TIMEOUT=5000 pnpm dev
```

### 왜 remote 는 파일을 안 쓰나

remote 가 env 로 받는 값은 `REMOTE_*_PUBLIC_URL` 하나뿐이고, 그건 **빌드 시점에 산출물에
굳는 값**이다(assetPrefix). 로컬에서 바꿀 일이 없고, 바꾸는 순간은 배포 파이프라인이라
어차피 빌드 인자로 들어온다([04-dokploy.md](./04-dokploy.md#환경변수)).
로컬 파일을 지원하려고 `loadEnv` 배선을 추가하면, 쓰지도 않을 경로가 번들러마다 하나씩
늘어난다.

## 변수 카탈로그

"설정 위치"는 **그 값이 실제로 먹는 자리**다. 위 절의 로딩 규칙에서 나온 결과다.

### remote 주소 — SSOT: `packages/remote-config/src/index.ts`

**remote 하나당 환경변수 하나다.** 이름은 `REMOTES[name].env` 에 있고, remote 를 추가하면
이름도 거기서 나온다.

| 이름                        | 설정 위치                         | 기본값                  |
| --------------------------- | --------------------------------- | ----------------------- |
| `REMOTE_CATALOG_PUBLIC_URL` | **셸** / host `.env.local` (아래) | `http://localhost:3001` |
| `REMOTE_CART_PUBLIC_URL`    | **셸** / host `.env.local` (아래) | `http://localhost:3002` |
| `REMOTE_ALLOWED_ORIGINS`    | host `.env.local`                 | 위 오리진만 (기본 닫힘) |

`*_PUBLIC_URL` 하나에서 **세 가지가 파생된다.** 조립은 `@mfa/remote-config` 가 하고,
파일명은 `MF_FILES` 에서 온다 — env 로 오지 않는다.

| 파생값                  | 조립                          | 읽는 곳                                |
| ----------------------- | ----------------------------- | -------------------------------------- |
| 브라우저 매니페스트 URL | `${오리진}/mf-manifest.json`  | `apps/host/next.config.ts`             |
| host 서버 SSR 번들 URL  | `${오리진}/mf-server.cjs`     | `host/src/mf/remote-endpoints.ts`      |
| remote 자산 접두사      | `${오리진}` (+ `/v<version>`) | `vite.config.ts` / `rsbuild.config.ts` |

> 예전에는 이 셋이 각각 환경변수였다(`NEXT_PUBLIC_REMOTE_*_ENTRY`, `REMOTE_*_SSR_ENTRY`,
> `REMOTE_*_PUBLIC_URL`). 실제 값은 하나인데 슬롯마다 파일명 접미사만 달라서, 복붙하다
> 어긋나면 404 가 아니라 "폴백 응답을 파싱하다 실패" 로 나타났다. env 는 오리진만 받는다.

한 값이 **읽히는 시점이 셋**이라 설정하는 자리도 그만큼이다.

- **remote 빌드 시점** — 자산 접두사가 산출물에 굳는다. 배포 파이프라인의 빌드 인자.
- **host 빌드 시점** — 브라우저용 매니페스트 URL 이 클라이언트 번들에 구워진다. 그리고
  프리렌더가 SSR 번들을 실제로 받아 실행하므로 이 시점에 remote 가 살아 있어야 한다.
  **런타임 env 로 못 바꾼다** — 바꾸려면 host 를 다시 빌드해야 한다.
  브라우저까지 전달되는 경로: [01-getting-started.md#브라우저용-값이-전달되는-경로](./01-getting-started.md#브라우저용-값이-전달되는-경로)
- **host 런타임** — 서버가 SSR 번들을 받아갈 때 다시 읽는다. 그래서 host 는 빌드 인자와
  런타임 env **양쪽에 같은 값**을 넣는다.

`REMOTE_ALLOWED_ORIGINS` 는 미설정이 곧 "위 오리진만 허용" 이다 — **기본값이 이미 닫혀
있다.** 프록시·CDN 을 remote 앞에 둘 때만 넓힌다.

### MF 운영 — 재배포 통보 / 캐시 무효화

| 이름                   | 읽는 곳                                   | 설정 위치         | 기본값                   |
| ---------------------- | ----------------------------------------- | ----------------- | ------------------------ |
| `MF_REVALIDATE_SECRET` | `host/src/lib/mf-secret.ts`               | host `.env.local` | 없음 → **항상 거부**     |
| `MF_SELF_ORIGIN`       | `host/src/app/api/mf-revalidate/route.ts` | host `.env.local` | `http://127.0.0.1:$PORT` |
| `PORT`                 | 위 루프백 주소 조립                       | 셸 / 플랫폼       | `3000`                   |

`MF_REVALIDATE_SECRET` 미설정은 "인증 없음"이 아니라 **전면 거부**다. 미설정을 통과로
해석하면 환경변수를 빠뜨린 배포가 조용히 열린 엔드포인트가 되기 때문이다. 로컬에서
`/api/mf-revalidate` · `/internal/mf-warm` 을 실험하려면 반드시 넣어야 한다.

```bash
node -e "console.log(require('node:crypto').randomBytes(24).toString('base64url'))"
```

`MF_SELF_ORIGIN` 은 리버스 프록시 뒤라 루프백이 안 닿을 때만 설정한다.

### 신뢰 경계 — 서명 / 무결성

배경: [04-remote-lifecycle.md](../02-architecture/04-remote-lifecycle.md#운영-레퍼런스),
[03-cache-modes.md](../04-experiments/03-cache-modes.md) 발견 9.

| 이름                   | 읽는 곳                           | 설정 위치          | 기본값                          |
| ---------------------- | --------------------------------- | ------------------ | ------------------------------- |
| `MF_SIGNING_KEY`       | `scripts/stamp-remote-version.ts` | **셸** (remote CI) | 없음 → 서명 안 붙임             |
| `MF_REMOTE_PUBLIC_KEY` | `host/src/mf/remote-trust.ts`     | host `.env.local`  | 없음                            |
| `MF_REQUIRE_SIGNATURE` | `host/src/mf/remote-trust.ts`     | host `.env.local`  | 꺼짐 (`"1"` 일 때만 켜짐)       |
| `MF_REQUIRE_INTEGRITY` | `host/src/mf/remote-trust.ts`     | host `.env.local`  | `NODE_ENV=production` 이면 켜짐 |

```bash
node scripts/gen-signing-key.ts
# MF_SIGNING_KEY       → remote CI 에만  (개인키. host 에 두지 말 것)
# MF_REMOTE_PUBLIC_KEY → host 에만       (+ MF_REQUIRE_SIGNATURE=1)
```

- 키는 **비대칭**이다. 개인키가 host 에 있으면 서명 검증의 의미가 없다.
- `MF_REQUIRE_SIGNATURE=1` 인데 `MF_REMOTE_PUBLIC_KEY` 가 없으면 로드가 에러로 죽는다.
  "검증하라고 했는데 검증할 수단이 없음"을 조용히 통과시키지 않는다.
- `MF_REQUIRE_INTEGRITY` 만 기본값이 `NODE_ENV` 파생이다. `"0"` 으로 명시하면 프로덕션에서도
  끈다 — remote 를 고쳐가며 SRI 불일치가 걸리적거릴 때의 탈출구다.

### 빌드 · 개발 편의

| 이름                       | 읽는 곳                               | 설정 위치    | 기본값       |
| -------------------------- | ------------------------------------- | ------------ | ------------ |
| `WAIT_FOR_REMOTES_TIMEOUT` | `scripts/wait-for-remotes.ts`         | **셸**       | `60000` (ms) |
| `REMOTE_KEEP_VERSIONS`     | `scripts/docker/remote-entrypoint.sh` | 컨테이너 env | `5`          |
| `NODE_ENV`                 | 여러 곳                               | 도구가 설정  | —            |

### 직접 설정하지 않는 것

`MFA_REMOTE_WEB_ENTRIES` — `apps/host/next.config.ts` 가 `REMOTE_*_PUBLIC_URL` 을
순회해 매니페스트 URL 로 조립한 뒤 번들에 굽는 값이다. host 코드가 remote 이름을 모르게 하려는 장치다
([그 경로](./01-getting-started.md#브라우저용-값이-전달되는-경로)). 밖에서 덮어쓰는 것도
유효하지만 보통 불필요하다.

## 새 환경변수를 추가할 때

1. **`turbo.json` 의 `globalEnv` 에 등록한다.** turbo 는 strict env 라 등록하지 않은 변수를
   태스크 환경에서 걸러낸다 — 설정이 에러 없이 **조용히 무시된다.**
   실측: 등록 전에는 `WAIT_FOR_REMOTES_TIMEOUT=1` 을 줘도 60초를 다 기다렸다.
   단 remote 주소 변수는 `REMOTE_*` / `MF_*` 와일드카드가 이미 잡고 있어 remote 를
   추가해도 손댈 필요가 없다.
2. remote 별 변수라면 **이름을 `packages/remote-config` 에 적는다.** 값이 아니라 이름이다.
   `satisfies Record<RemoteName, RemoteDefinition>` 이 누락을 컴파일 타임에 잡는다.
3. 빌드 타임에 굳는 값이라면 **Dockerfile 에 `ARG` + `ENV` 를 추가**하고 Dokploy Build Args 에도
   넣는다([04-dokploy.md](./04-dokploy.md#환경변수)).
4. host 에서만 읽는 런타임 값이라면 코드에서 `process.env.리터럴` 로 읽는다. 브라우저 번들에
   들어가는 자리라면 동적 접근(`process.env[key]`)은 치환되지 않아 `undefined` 가 된다.

## 자주 밟는 함정

**브라우저용 값을 런타임에 바꾸려 한다.** 매니페스트 URL 은 host 빌드 시점에 클라이언트
번들로 구워진다. 컨테이너 env 를 바꿔도 브라우저는 옛 값을 쓴다. 다시 빌드해야 한다.

**값 없는 빌드 인자가 빈 문자열로 도착한다.** Dockerfile 에서 `ARG` 를 값 없이 선언하면
`""` 가 들어온다. `??` 는 빈 문자열을 유효한 설정으로 받아 `new URL("")` 에서 터진다.
그래서 `publicOrigin()` 이 `||` 를 쓴다.

**turbo strict env 로 값이 조용히 사라진다.** 위 체크리스트 1번.

**gitignore 된 `.env.local` 이 turbo 캐시 입력에서 빠진다.** turbo 의 기본 입력 집합은 git 이
추적하는 파일이다. `.env.local` 에 `REMOTE_*_PUBLIC_URL` 을 적으면 **프리렌더 결과가 거기
달리는데** 캐시는 그걸 모른다 — 오리진을 바꿔도 캐시된 옛 `.next` 가 복원된다(실측: FULL TURBO).
`turbo.json` 의 `@mfa/host#build` 가 `inputs: ["$TURBO_DEFAULT$", ".env*"]` 로 막아뒀다.

**host `.env.local` 에 기본값을 그대로 다시 적는다.** 한때 그렇게 뒀다가 지웠다. 기본값과 한
글자도 다르지 않은 파일이라 얻는 게 없고, 위 캐시 함정의 표면적만 넓혔다.
**바꿔야 할 값만 적는다.**

```
# apps/host/.env.local — 이 정도가 적정선
MF_REVALIDATE_SECRET=…    # 미설정이면 /api/mf-revalidate 는 전부 거부한다
```
