# 실행 방법

## 요구사항

- Node.js **>= 24.19.0** (검증: v24.3.0) — `packages/remote-config` 가 타입 스트리핑으로
  `.ts` 를 직접 실행하므로 이 아래 버전에서는 로드되지 않는다
- pnpm **11.x** (검증: 11.22.0)

## 설치

```bash
cd mfa-nextjs
pnpm install
```

> 네트워크가 느리면 `@rspack/binding-*` 다운로드에서 타임아웃이 날 수 있다.
> `pnpm install --fetch-timeout 300000` 으로 재시도한다.

## 전체 개발 서버 기동

```bash
pnpm dev
```

remote 는 앱마다 **프로세스가 둘**이다(`concurrently`).

| 프로세스 | 하는 일                                                                            |
| -------- | ---------------------------------------------------------------------------------- |
| `web`    | 브라우저용 dev 서버 (`remoteEntry.js` / HMR)                                       |
| `ssr`    | **node 타깃 CJS 번들 watch 빌드** (`dist/mf-server.cjs`) — host 서버가 SSR 에 쓴다 |

| URL                         | 앱                       |
| --------------------------- | ------------------------ |
| http://localhost:3000       | host (여기서 시작)       |
| http://localhost:3001       | catalog remote 단독 실행 |
| http://localhost:3002       | cart remote 단독 실행    |
| http://localhost:3000/debug | **MF 진단 화면**         |

## 확인 순서

1. **SSR 확인** — 자바스크립트 없이 초기 HTML 만 본다

   ```bash
   curl -s localhost:3000/products/kb-001 | grep -c "Aurora 75"   # 1
   curl -s localhost:3000/checkout        | grep -c "주문서"       # 1
   ```

   remote 마크업이 서버에서 이미 그려져 나온다.

2. http://localhost:3000 → 보라색 점선(catalog · Vite), 초록색 점선(cart · Rsbuild)

3. 상품 카드의 **담기** → 헤더 배지 숫자/금액 즉시 증가
   → 서로 다른 번들러로 빌드된 두 remote 가 상태를 공유하는 지점

4. **소프트 내비게이션 확인** — DevTools Network 를 `Doc` 필터로 켜둔다
   - 헤더 `결제` 클릭 → **document 요청이 늘지 않는다** (remote, 소프트)

5. `/debug` → 두 remote manifest 의 실제 `exposes` 목록

6. `/lab` → SSR · ISR 등가 · 태그 무효화 세 모드 비교
   (`GET /api/lab/stats` 로 번들 fetch/eval 횟수와 이 인스턴스가 아는 버전을 볼 수 있다)

## 빌드

```bash
pnpm build       # 전체 (의존 순서는 turbo 가 처리)
pnpm typecheck
pnpm lint
```

`scripts/` 도 `.ts` 이고 검사 대상이다. 워크스페이스 패키지가 아니라 루트에 있어서
turbo 루트 태스크(`//#typecheck:scripts`, `//#lint:scripts`)로 따로 걸어뒀고,
위 두 명령에 함께 실행된다. Node 24 가 타입 스트리핑으로 직접 실행하므로 빌드는 없다.

### host 빌드는 remote 가 **떠 있어야** 끝난다

host 빌드는 순수한 컴파일이 아니다. 프리렌더 도중 remote 의 SSR 번들을 HTTP 로 받아
실행한다(`src/mf/server-loader.ts`). remote 오리진이 안 뜨면 이렇게 죽는다.

```
Error occurred prerendering page "/_not-found"
TypeError: fetch failed ... ECONNREFUSED
```

`RemoteBoundary` 는 이걸 못 막는다. 런타임 장애는 에러 박스로 격리되지만 **프리렌더 실패는
빌드 실패**다. 그래서 `pnpm build` 한 번으로 끝나도록 두 조각이 맞물려 있다.

| 조각                             | 담당                                                |
| -------------------------------- | --------------------------------------------------- |
| remote 를 먼저 빌드한다          | turbo — `turbo.json` 의 `@mfa/host#build.dependsOn` |
| 빌드하는 동안 `dist` 를 서빙한다 | host 의 `build` 스크립트 (`concurrently`)           |

```jsonc
// apps/host/package.json
"build": "concurrently --kill-others --success first -n catalog,cart,next \
  \"node ../../scripts/serve-remote-dist.ts catalog\" \
  \"node ../../scripts/serve-remote-dist.ts cart\" \
  \"next build\""
```

포트도 `dist` 위치도 인자로 안 넘긴다. remote 이름만 주면
`packages/remote-config` 에서 파생한다 — 그래야 포트 지식이 호출부마다 복사되지 않는다.

`--success first` 는 "먼저 끝난 프로세스의 종료 코드를 쓴다"는 뜻이다. 서버는 안 끝나므로
그건 항상 `next build` 다. `--kill-others` 가 빌드가 끝나는 즉시 서버를 내린다.

**준비 대기는 없다.** 필요 없어서다 — 서버 바인딩은 `+1ms`, `next build` 의 첫 remote 요청은
`+6451ms` 다(실측). 컴파일과 타입체크가 그 앞을 다 막고 있다.

두 번째 조각을 turbo 로 못 쓰는 이유(`with` 사이드카는 `turbo run build` 를 종료시키지
못한다)는 [05-troubleshooting/01-known-issues.md](../05-troubleshooting/01-known-issues.md) 에
실측과 함께 있다.

배포 이미지는 이 스크립트를 쓰지 않는다. `docker:build` 라는 별도 태스크를 부르고, 거기서
remote 는 이미 배포된 공개 도메인이다.

> `pnpm dev` 를 띄운 채로는 빌드하지 않는다. dev 서버는 버전 매니페스트를 공표하지 않으므로
> (그래야 dev 가 불변 경로를 찾지 않는다) 빌드가 무결성 값을 못 찾고 죽는다.
> 에러 메시지에 그 힌트가 들어 있다.

remote 의 `build` 는 **네 단계**다. 버전을 빌드 전에 정해야 자산 URL 접두사에 넣을 수 있다.

```jsonc
// apps/remote-catalog/package.json
"build":     "node ../../scripts/mf-build-version.ts && vite build && pnpm build:ssr && pnpm stamp",
"build:ssr": "vite build --config vite.config.server.ts",
"stamp":     "node ../../scripts/stamp-remote-version.ts catalog"
```

| 단계               | 하는 일                                                              |
| ------------------ | -------------------------------------------------------------------- |
| `mf-build-version` | 버전 결정(git SHA → 타임스탬프) → `.mf-version`                      |
| 웹 빌드            | `base`/`assetPrefix` = `/v<version>/`, 출력도 `dist/v<version>/`     |
| SSR 빌드           | 같은 버전 디렉터리에 `mf-server.cjs`                                 |
| `stamp`            | 무결성·서명 계산 → `dist/mf-version.json` 공표, 옛 버전 3개까지 정리 |

산출물 배치와 각 필드의 의미는
[02-architecture/04-remote-lifecycle.md](../02-architecture/04-remote-lifecycle.md) 참고.

```
dist/
├── mf-version.json       ← 현재 버전 공표
└── v<version>/           ← 불변
    ├── mf-manifest.json  ← 브라우저
    ├── remoteEntry.js
    └── mf-server.cjs     ← host 서버 (SSR)
```

## 프로덕션 미리보기

```bash
pnpm build
pnpm start
```

remote 는 번들러 preview 가 아니라 **공용 정적 서버**로 뜬다
(`scripts/serve-remote-dist.ts`). 두 번들러의 preview 가 버전 경로를 서빙하는 방식이 달라서
배포 표면을 하나로 통일했고, 실제 배포에서 그 자리는 CDN 이다.

```
/v<version>/…      Cache-Control: public, max-age=31536000, immutable
/mf-version.json   Cache-Control: no-store
```

> `mf-server.cjs` 는 host **서버**가 가져간다. CDN 에 올리더라도 host 서버에서 접근 가능해야 한다.

### 재배포 통보 (선택)

remote 를 다시 배포했으면 host 에 알려 캐시를 즉시 갱신할 수 있다.

```bash
curl -XPOST "$HOST_URL/api/mf-revalidate" \
  -H "x-mf-secret: $MF_REVALIDATE_SECRET" \
  -H 'content-type: application/json' \
  -d '{"remote":"catalog"}'
```

**안 보내도 된다.** 모든 host 인스턴스가 30초 TTL 안에 `mf-version.json` 을 다시 읽어
스스로 수렴한다. 웹훅은 그걸 즉시로 당길 뿐이다.

### 서명 (선택)

```bash
node scripts/gen-signing-key.ts
# MF_SIGNING_KEY       → remote CI 에만
# MF_REMOTE_PUBLIC_KEY → host 에만  (+ MF_REQUIRE_SIGNATURE=1)
```

## 환경변수

**로컬은 아무것도 설정하지 않아도 된다.** 기본값이 코드에 있다.

| 이름                               | 기본값                                   |
| ---------------------------------- | ---------------------------------------- |
| `NEXT_PUBLIC_REMOTE_CATALOG_ENTRY` | `http://localhost:3001/mf-manifest.json` |
| `NEXT_PUBLIC_REMOTE_CART_ENTRY`    | `http://localhost:3002/mf-manifest.json` |
| `REMOTE_CATALOG_SSR_ENTRY`         | `http://localhost:3001/mf-server.cjs`    |
| `REMOTE_CART_SSR_ENTRY`            | `http://localhost:3002/mf-server.cjs`    |

이 표의 원본은 **`packages/remote-config`** 다. remote 이름·포트·env 이름·산출물
파일명이 전부 거기 있고, 위 기본값은 그 조합에서 파생된다. **remote 를 추가할 때 고칠 곳은
그 패키지 하나다** — 코드도, 스크립트도, 번들러 설정도, `turbo.json` 도 순회해서 읽는다.
유일한 예외는 `docker-compose.yml`(정적 YAML 이라 모듈을 못 읽는다. 로컬 검증 전용).

이름만 추가하고 정의를 빠뜨리면 `satisfies Record<RemoteName, RemoteDefinition>` 이
컴파일 타임에 막는다 — remote 추가가 반쯤 된 채로 넘어가지 않는다.

> 이 패키지만 **빌드 산출물이 없다.** `exports` 가 `src/index.ts` 를 직접 가리키고
> Node 24 의 타입 스트리핑이 실행 시점에 타입을 지운다. 번들러 config 의 import 는
> 프로세스 시작 즉시 일어나서 watch 빌드가 `dist/` 를 만들 틈이 없기 때문이다
> (tsc 빌드형으로 두면 `failed to load config from vite.config.ts` 로 죽는다 — 실측).
> 그래서 `engines.node` 가 `>=24.19.0` 이고, `erasableSyntaxOnly` 로 타입 스트리핑이
> 처리 못 하는 문법(enum·namespace 등)을 컴파일 타임에 막는다.

### 브라우저용 값이 전달되는 경로

`NEXT_PUBLIC_*` 은 `process.env.리터럴` 형태만 빌드 타임에 치환된다. 동적 접근은
치환되지 않아 브라우저에서 `undefined` 가 되므로, host **코드**에서는 remote 목록을
순회하며 env 를 읽을 수 없다. 그래서 순회를 한 단계 앞으로 옮겼다.

```
packages/remote-config          remote 목록 + env 이름 + 기본값
  ↓  (node 에서 순회)
apps/host/next.config.ts        env: { MFA_REMOTE_WEB_ENTRIES: JSON.stringify(…) }
  ↓  (Next 가 번들에 인라인)
apps/host/src/mf/remote-endpoints.ts   리터럴 하나만 읽어 JSON.parse
```

`next.config.ts` 는 node 에서 평가되므로 순회가 가능하고, `env` 로 넘긴 값은
`NEXT_PUBLIC_` 접두사 없이도 브라우저 번들에 인라인된다(그 접두사는 환경/`.env` 파일로
들어온 변수에만 적용되는 규칙이다). 결과적으로 host 코드에는 remote 이름이 없다.

SSR 엔트리는 이 경로를 타지 않는다. host **서버**만 쓰는 값이라 브라우저에 노출할 이유가
없고, 서버에서는 `process.env[이름]` 동적 접근이 그대로 동작한다.

한때 `apps/host/.env.local` 로 이 값들을 그대로 다시 적어뒀다가 지웠다. 기본값과 한 글자도
다르지 않은 파일이었고, gitignore 라 **turbo 캐시 입력에서 빠져** 값을 바꿔도 캐시된 옛
빌드가 복원되는 함정만 만들었다(그 자리는 `inputs` 로 막아뒀다).

바꿔야 할 때만 만든다. 예를 들어 remote 를 다른 포트에 띄웠거나 재배포 웹훅을 테스트할 때:

```
# apps/host/.env.local
MF_REVALIDATE_SECRET=change-me    # 미설정이면 /api/mf-revalidate 는 전부 거부한다
```

브라우저용만 `NEXT_PUBLIC_` 이 필요하다. 서버용 SSR 엔트리는 브라우저에 노출할 이유가 없고,
**오리진 허용 목록의 기본값이 그 값에서 나온다.**

정상 동작 시 브라우저는 이 폴백이 아니라 **서버가 심어준 버전 경로 엔트리**를 쓴다.
서버 마크업과 hydrate 하는 코드를 같은 빌드로 맞추기 위해서다.

보안·운영용 나머지 변수(`REMOTE_ALLOWED_ORIGINS`, `MF_REMOTE_PUBLIC_KEY`,
`MF_REQUIRE_SIGNATURE`, `MF_REQUIRE_INTEGRITY`)는
[04-remote-lifecycle.md](../02-architecture/04-remote-lifecycle.md#운영-레퍼런스) 에 정리돼 있다.

> 새 환경변수는 `turbo.json` 의 `globalEnv` 에도 등록해야 한다. turbo 는 strict env 라
> 등록하지 않은 변수를 태스크 환경에서 걸러낸다(모르고 지나가면 설정이 조용히 무시된다).
> 단 remote 주소 변수는 이미 `NEXT_PUBLIC_REMOTE_*` / `REMOTE_*` 와일드카드로 잡혀 있어
> remote 를 추가해도 손댈 필요가 없다.

## 개별 앱만 실행

```bash
pnpm --filter @mfa/remote-catalog dev   # remote 만 단독 개발
pnpm --filter @mfa/host dev             # host 만
```

remote 가 안 떠 있으면 host 는 죽지 않는다.

- 서버 렌더 단계에서 SSR 번들 fetch 가 실패하면 `RemoteBoundary` 가 에러 박스를 그린다
- 다른 remote 와 host 셸은 정상 동작한다

독립 장애 격리를 확인하려면 remote 하나만 꺼보면 된다.

## 포트가 물려 있을 때

`next start` 는 프로세스 이름이 `next-server` 라서 `pkill -f 'next start'` 로 잡히지 않는다.

```bash
for p in 3000 3001 3002; do
  lsof -nP -iTCP:$p -sTCP:LISTEN -t | xargs -r kill -9
done
```
