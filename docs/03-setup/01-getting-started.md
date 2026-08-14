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
| http://localhost:3003/legacy-checkout | Multi-Zone 비교용 앱 |
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
   - 헤더 `결제(zone·비교용)` 클릭 → **document 요청 1건** (Multi-Zone, 하드)

5. `/debug` → 두 remote manifest 의 실제 `exposes` 목록

## 빌드

```bash
pnpm build       # 전체 (의존 순서는 turbo 가 처리)
pnpm typecheck
pnpm lint
```

remote 의 `build` 는 두 단계다.

```jsonc
// apps/remote-catalog/package.json
"build":     "vite build && pnpm build:ssr",
"build:ssr": "vite build --config vite.config.server.ts"
```

두 산출물이 같은 `dist/` 에 들어간다.

```
dist/remoteEntry.js      ← 브라우저
dist/mf-manifest.json    ← 브라우저
dist/mf-server.cjs       ← host 서버 (SSR)
```

## 프로덕션 미리보기

```bash
pnpm build
pnpm start
```

remote 는 `vite preview` / `rsbuild preview` 로 뜬다.
실제 배포에서는 remote 의 `dist/` 를 정적 호스팅에 올리고 host 의 환경변수를 그 주소로 바꾼다.

> `mf-server.cjs` 는 host **서버**가 가져간다. CDN 에 올리더라도 host 서버에서 접근 가능해야 한다.

## 환경변수

`apps/host/.env.local`:

```
# [브라우저] remote 웹 번들
NEXT_PUBLIC_REMOTE_CATALOG_ENTRY=http://localhost:3001/mf-manifest.json
NEXT_PUBLIC_REMOTE_CART_ENTRY=http://localhost:3002/mf-manifest.json

# [서버] remote SSR 번들 — NEXT_PUBLIC_ 을 붙이지 않는다
REMOTE_CATALOG_SSR_ENTRY=http://localhost:3001/mf-server.cjs
REMOTE_CART_SSR_ENTRY=http://localhost:3002/mf-server.cjs

# Multi-Zones 비교용
ZONE_CHECKOUT_URL=http://localhost:3003
```

브라우저용만 `NEXT_PUBLIC_` 이 필요하다. 서버용 SSR 엔트리는 브라우저에 노출할 이유가 없다.

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
for p in 3000 3001 3002 3003; do
  lsof -nP -iTCP:$p -sTCP:LISTEN -t | xargs -r kill -9
done
```
