# 실행 방법

## 요구사항

- Node.js **>= 20.9.0** (검증: v24.3.0)
- pnpm **11.x** (검증: 11.18.0)

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

| 프로세스 | 하는 일 |
| --- | --- |
| `web` | 브라우저용 dev 서버 (`remoteEntry.js` / HMR) |
| `ssr` | **node 타깃 CJS 번들 watch 빌드** (`dist/mf-server.cjs`) — host 서버가 SSR 에 쓴다 |

| URL | 앱 |
| --- | --- |
| http://localhost:3000 | host (여기서 시작) |
| http://localhost:3001 | catalog remote 단독 실행 |
| http://localhost:3002 | cart remote 단독 실행 |
| http://localhost:3000/debug | **MF 진단 화면** |

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

remote 의 `build` 는 **네 단계**다. 버전을 빌드 전에 정해야 자산 URL 접두사에 넣을 수 있다.

```jsonc
// apps/remote-catalog/package.json
"build":     "node ../../scripts/mf-build-version.mjs && vite build && pnpm build:ssr && pnpm stamp",
"build:ssr": "vite build --config vite.config.server.ts",
"stamp":     "node ../../scripts/stamp-remote-version.mjs catalog"
```

| 단계 | 하는 일 |
| --- | --- |
| `mf-build-version` | 버전 결정(git SHA → 타임스탬프) → `.mf-version` |
| 웹 빌드 | `base`/`assetPrefix` = `/v<version>/`, 출력도 `dist/v<version>/` |
| SSR 빌드 | 같은 버전 디렉터리에 `mf-server.cjs` |
| `stamp` | 무결성·서명 계산 → `dist/mf-version.json` 공표, 옛 버전 3개까지 정리 |

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
(`scripts/serve-remote-dist.mjs`). 두 번들러의 preview 가 버전 경로를 서빙하는 방식이 달라서
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
node scripts/gen-signing-key.mjs
# MF_SIGNING_KEY       → remote CI 에만
# MF_REMOTE_PUBLIC_KEY → host 에만  (+ MF_REQUIRE_SIGNATURE=1)
```

## 환경변수

`apps/host/.env.local`:

```
# [브라우저] 버전 정보를 못 읽었을 때의 폴백 엔트리
NEXT_PUBLIC_REMOTE_CATALOG_ENTRY=http://localhost:3001/mf-manifest.json
NEXT_PUBLIC_REMOTE_CART_ENTRY=http://localhost:3002/mf-manifest.json

# [서버] remote SSR 번들 — NEXT_PUBLIC_ 을 붙이지 않는다
# 오리진 허용 목록의 기본값도 여기서 나온다
REMOTE_CATALOG_SSR_ENTRY=http://localhost:3001/mf-server.cjs
REMOTE_CART_SSR_ENTRY=http://localhost:3002/mf-server.cjs

# 재배포 통보 · warm 라우트 인증. 미설정이면 둘 다 전부 거부한다
MF_REVALIDATE_SECRET=change-me

```

브라우저용만 `NEXT_PUBLIC_` 이 필요하다. 서버용 SSR 엔트리는 브라우저에 노출할 이유가 없다.

정상 동작 시 브라우저는 이 폴백이 아니라 **서버가 심어준 버전 경로 엔트리**를 쓴다.
서버 마크업과 hydrate 하는 코드를 같은 빌드로 맞추기 위해서다.

보안·운영용 나머지 변수(`REMOTE_ALLOWED_ORIGINS`, `MF_REMOTE_PUBLIC_KEY`,
`MF_REQUIRE_SIGNATURE`, `MF_REQUIRE_INTEGRITY`)는
[04-remote-lifecycle.md](../02-architecture/04-remote-lifecycle.md#운영-레퍼런스) 에 정리돼 있다.

> 새 환경변수는 `turbo.json` 의 `globalEnv` 에도 등록해야 한다. turbo 는 strict env 라
> 등록하지 않은 변수를 태스크 환경에서 걸러낸다(모르고 지나가면 설정이 조용히 무시된다).

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
