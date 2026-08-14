# 실험 C — MFA 에서 ISR / Cache Components

**측정일** 2026-08-14 · **Next** 16.3.1 (Turbopack) · **host** 프로덕션 빌드 + `next start`

## 질문

> 런타임 Module Federation 을 쓰면 Next.js 의 캐시 기능을 잃는가?

모노레포 단일 Next 앱이라면 당연히 쓰는 기능이다. MFA 를 도입하면서 못 쓰게 된다면
아키텍처 선택 자체가 반려된다. **실측으로 판정했다. 답은 "잃지 않는다".**

## 전제 — Next 16 은 세그먼트 설정을 버렸다

먼저 바로잡을 것. `export const dynamic = "force-dynamic"` 은 **Next 16 에서 더 이상 쓰지 않는다.**
[공식 이행 가이드](https://nextjs.org/docs/app/guides/migrating-to-cache-components) 기준 매핑:

| 옛 방식 | Next 16 (Cache Components) |
| --- | --- |
| `dynamic = "force-dynamic"` | **삭제.** 캐시하지 않으면 기본이 동적. 요청 시점 실행이 꼭 필요하면 `connection()` + `<Suspense>` |
| `dynamic = "force-static"` (Route Handler) | `"use cache"` 헬퍼 함수로 분리 |
| `revalidate = N` | `"use cache"` + `cacheLife(...)` |
| `fetchCache` | 삭제 |
| `experimental_ppr` | 삭제. PPR 이 Cache Components 에 흡수 |
| `dynamicParams` | 미지원. 삭제 |
| `unstable_noStore()` | 삭제. 기본이 uncached |
| `unstable_cache(fn, keys, opts)` | `"use cache"` + `cacheLife` + `cacheTag` |

그래서 이 저장소는 **`cacheComponents: true` 를 기본**으로 삼는다.
`dynamic`/`revalidate` 를 남긴 채 켜면 컴파일 에러다:

```
Error: Route segment config "revalidate" is not compatible with
       `nextConfig.cacheComponents`. Please remove it.
```

전면 이행이 부담이면 세그먼트에 `export const instant = false` 로 검증만 미룰 수 있다
(단, `new Date()` 같은 동기 IO 빌드 에러는 이걸로 안 없어진다).

## 설계

세 라우트가 **완전히 같은 트리**를 렌더한다 — 같은 remote(`catalog/ProductGrid`), 같은 패널.
다른 것은 캐시 선언 한 줄뿐이다.

| 라우트 | 캐시 선언 | 옛 표현 |
| --- | --- | --- |
| `/lab/ssr` | `await connection()` + `<Suspense>` | `dynamic = "force-dynamic"` |
| `/lab/isr` | `"use cache"` + `cacheLife({revalidate:60})` | `revalidate = 60` |
| `/lab/cache` | `"use cache"` + `cacheLife("minutes")` + `cacheTag()` | (없음) |

판정 지표 3개: **렌더 시각이 얼어붙는가** · **HTML 에 remote 마크업이 있는가** ·
**요청당 remote 번들 fetch/eval 이 몇 번인가**(`/api/lab/stats` 계측).

## 결과

빌드 라우트 표:

```
┌ ○ /            ○ /cart  ○ /checkout  ○ /debug  ○ /lab
├ ○ /lab/cache                  1m      1h
├ ○ /lab/isr                    1m      1h
├ ◐ /lab/ssr                                  ← Partial Prerender
└ ◐ /products/[id]                            ← Partial Prerender
```

프리렌더 HTML 안의 remote 마크업(`Aurora 75`):

| 파일 | remote 마크업 |
| --- | --- |
| `lab/cache.html` | **있음** |
| `lab/isr.html` | **있음** |
| `index.html` | **있음** |
| `lab/ssr.html` | 없음 (의도된 동적 구멍) |

3회 연속 요청:

| 라우트 | `x-nextjs-cache` | 서버 렌더 시각 | remote 마크업 | TTFB | 번들 fetch/eval |
| --- | --- | --- | --- | --- | --- |
| `/lab/ssr` | – | 매 요청 갱신 | 있음 | 74 → 10 → 9 ms | 1 / 1 |
| `/lab/isr` | HIT ×3 | **고정** | **있음** | 5 → 2 → 2 ms | **0 / 0** |
| `/lab/cache` | HIT ×3 | **고정** | **있음** | 6 → 4 → 3 ms | **0 / 0** |

참고로 이행 전(구 모델, `revalidate = 60`)에도 동일하게 나왔다:
`/lab/isr` HIT ×3, 렌더 시각 고정, remote 마크업 있음, fetch/eval 0/0.
**즉 ISR 동작은 캐시 모델 교체와 무관하게 성립한다.**

### 태그 무효화

```
전     /lab/cache  cache=HIT    at=13:05:52  remote=true
웹훅 POST /api/mf-revalidate {"remote":"catalog"}   ← 태그만, 경로 나열 없음
후 1   /lab/cache  cache=STALE  at=13:05:52  remote=true   ← 옛 값 서빙 + 백그라운드 재생성
후 2   /lab/cache  cache=HIT    at=13:06:11  remote=true   ← 새 렌더로 교체됨
후 3~4 /lab/cache  cache=HIT    at=13:06:11  remote=true
```

잘못된 시크릿 → 401.

## 발견

### 1. ISR 은 MFA 에서 그대로 동작한다 ✅

캐시된 HTML 에 remote 마크업이 들어간다. App Router 렌더 파이프라인 구조 때문이다.

```
1) RSC 렌더 → Flight payload   (client component = 참조 + props)
2) SSR      → HTML             (client component 를 서버에서 실행)
```

캐시는 **둘 다** 저장한다. `RemoteComponent` 는 client component 지만 2단계에서 서버 실행되므로
remote 마크업이 캐시 대상 HTML 안으로 들어간다.

효과: `mf-server.cjs` fetch + `new Function` 평가가 **요청당 → 재생성 주기당 1회**.
이 아키텍처에서 제일 비싼 구간이라 ISR 이득이 단일 앱보다 오히려 크다.

### 2. 태그는 `cacheTag()` 로 달아야 전파된다 ✅ (초기 오진 정정)

처음엔 remote 번들 fetch 에 `next: { tags: [...] }` 를 달고 "태그가 안 먹는다"고 결론냈다.
**틀렸다.** Cache Components 모델에서는 `fetch` 의 `next.tags` 가 Data Cache 계층에만 붙고
`"use cache"` 엔트리에는 붙지 않는다. 가이드가 명시한다 —
*"Tag data with `cacheTag` inside a `use cache` function instead of the `fetch` `next.tags` option."*

고친 형태:

```ts
async function CachedShell() {
  "use cache";
  cacheLife("minutes");
  cacheTag(remoteCacheTag("catalog"));   // ← 이 스코프가 자기 의존성을 선언
  return <LabPanel … />;
}
```

**의미가 크다.** 각 캐시 스코프가 "나는 catalog remote 에 의존한다"고 스스로 선언하므로
host 는 *어느 라우트가 어느 remote 를 쓰는지* 맵을 관리할 필요가 없다.
remote CI 는 태그 하나만 만료시키면 된다.

예외: 캐시 스코프 없이 통째로 프리렌더된 정적 라우트(`/` 등)는 태그가 없다.
그런 라우트까지 깨려면 `revalidatePath` 가 필요하다 (웹훅의 `?paths=1`).

### 3. `revalidateTag` 는 SWR 이다 (즉시 아님)

Next 16 부터 `revalidateTag(tag, profile)` 는 프로필 인자가 **필수**이고 동작은
stale-while-revalidate 다. 무효화 직후 1회는 `STALE`(옛 값)을 주고 백그라운드에서 갱신한다.

remote 재배포 시나리오에서는 이게 맞다 — 사용자에게 잠깐 옛 remote 를 보여주더라도 응답은 빠르다.
즉시성이 필요하면 `updateTag` 지만 Server Action 전용이라 웹훅에서는 못 쓴다.

### 4. cacheComponents 이행 비용은 대부분 MFA 와 무관하다

실제로 고친 것:

- `SiteHeader` 의 `usePathname()` → Suspense 로 감싸기 (`CLIENT_HOOK_DYNAMIC`)
- `/products/[id]` 의 `params` await → Suspense 안으로 이동 (`blocking-prerender-dynamic`)
- 각 라우트의 `dynamic`/`revalidate` export 삭제

전부 일반 Next 16 앱이 똑같이 치르는 비용이다.
**remote 로딩 경로 때문에 추가로 고친 것은 없었다.**

### 5. `generateStaticParams` 는 빈 배열을 못 준다 ⚠️ (초기 제안 정정)

이행 전 계획에서 "host 빌드가 remote 기동에 의존하지 않도록 `generateStaticParams` 가
빈 배열을 반환하게 하자"고 했는데, Cache Components 에서는 이게 에러다
(`empty-generate-static-params`). 최소 1개는 반환해야 한다.
반환하지 않은 경로는 정적 셸만 프리렌더되고 나머지는 요청 시 스트리밍된다.

→ **host 빌드는 remote 가 떠 있어야 한다**는 제약이 남는다. 프리렌더 대상을 1개로 줄여
영향은 최소화할 수 있다.

### 6. 스켈레톤 캐싱 위험 — 재현했고 고쳤다 ✅

처음엔 "1회 관측, 재현 실패"로 적었다. 조건을 고정하니 **결정적으로 재현**된다.

재현 조건: remote SSR 번들 응답이 느리고(+800ms 지연 프록시), host 프로세스와
Data Cache 가 모두 콜드인 상태에서 페이지 캐시가 무효화될 때.
재생성 렌더가 remote 를 기다리다 **Suspense fallback 상태로 캐시에 굳고**,
그 엔트리가 이후 `HIT` 로 계속 서빙된다.

| 라운드 4회 (콜드 프로세스, remote +800ms) | 스켈레톤이 캐시됨 |
| --- | --- |
| A. 무효화만 (`?warm=0`) | **4 / 4** |
| B. warm-then-revalidate | **0 / 4** |

#### 고친 방식 — warm-then-revalidate

웹훅이 세 단계를 순서대로 밟는다.

1. **번들 계층만 무효화** — 세대 bump + `revalidateTag(번들태그, { expire: 0 })`
2. **warm** — `/internal/mf-warm` 을 자기 자신에게 요청해 SSR 레이어에서 번들을 실제로 평가
3. **페이지 캐시 무효화** — `revalidateTag(페이지태그, "max")`

warm 이 실패하면 3을 하지 않고 502 로 중단한다. 실측:

```
전   cache=HIT  at=13:24:59  remote=true
웹훅 502 {"error":"warm 실패 — 페이지 캐시를 건드리지 않고 중단했습니다"}
후   cache=HIT  at=13:24:59  remote=true   ← 옛 캐시 그대로
```

#### 이 과정에서 드러난 함정 4개

**(a) 태그가 하나면 순서를 못 만든다.** 번들 fetch 와 페이지가 같은 태그를 쓰면
번들을 깨는 순간 페이지도 깨져서 재생성이 warm 보다 먼저 일어난다.
`mf-remote-bundle:<name>`(Data Cache)과 `mf-remote:<name>`(페이지)로 분리했다.

**(b) 번들 태그는 `"max"` 가 아니라 `{ expire: 0 }` 이어야 한다.**
`"max"` 는 SWR 이라 다음 fetch 가 **옛 번들 바이트**를 그대로 돌려준다.
그러면 warm 이 옛 remote 코드를 데우고, remote 가 죽어 있어도 "성공"해버려 장애를 못 잡는다.

**(c) warm 성공 판정은 HTTP 상태로 못 한다.** warm 페이지의 remote 는 `RemoteBoundary`
안에 있어서 remote 가 죽어도 200 이 나온다. globalThis 계측기의 **성공 로드 카운터**가
증가했는지로 판정한다.

**(d) `lazy()` 캐시가 옛 remote 를 프로세스 수명 내내 고정한다.** ← 제일 지독했다.
`RemoteComponent` 는 모듈 스코프 Map 에 `lazy(() => loadRemoteModule(id))` 를 캐시한다.
React 의 `lazy()` 는 한 번 resolve 되면 결과를 영구히 들고 있으므로, 번들 캐시를 아무리 비워도
로더가 다시 불리지 않는다. warm 요청이 네트워크를 전혀 타지 않는 형태로 드러났다.

```
warm#1  → fetches 0 → 1   (첫 로드)
bump    → 세대 +1
warm#2  → fetches 1 → 1   ❌ 로더가 안 불림
```

lazy 캐시 키에 세대를 넣어 고쳤다 (`${id}@${generation}`). 고친 뒤:

```
warm#2  → fetches 1 → 2   ✅
```

### 7. 캐시는 레이어별로, 무효화 신호는 globalThis 로

`bundleCache` 를 레이어 간에 공유하면 안 된다. Next 는 RSC 레이어와 SSR 레이어의
모듈 그래프를 분리하고 각 레이어의 `import * as React` 가 다른 React 빌드로 해석된다.
평가된 remote 번들에는 그 레이어의 React 가 주입돼 있어서, 공유하면 `useState` 가 깨진다.

반대로 무효화 신호는 모든 레이어에 닿아야 한다. Route Handler(RSC 레이어)가 재배포를
통보받아도 페이지를 렌더하는 SSR 레이어의 캐시는 그대로이기 때문이다.

→ **캐시는 레이어별 모듈 스코프, 세대 카운터만 globalThis.**
카운터가 오르면 각 레이어가 다음 접근에서 스스로 캐시를 버린다.

같은 이유로 warm 은 반드시 **client component 경유**로 해야 한다.
remote 번들을 평가하는 로더 인스턴스가 그 레이어에 있기 때문이다.

## 재현 방법

```bash
# remote 두 개 빌드 + 기동 (host 프리렌더가 이걸 fetch 한다)
pnpm turbo run build --filter=@mfa/remote-catalog --filter=@mfa/remote-cart
pnpm --filter @mfa/remote-catalog start &   # :3001
pnpm --filter @mfa/remote-cart start &      # :3002

pnpm turbo run build --filter=@mfa/host
MF_REVALIDATE_SECRET=lab-secret pnpm --filter @mfa/host start
```

브라우저에서 `/lab` 인덱스로 세 모드 비교.
계측은 `GET /api/lab/stats`, 리셋은 `DELETE /api/lab/stats`.
무효화는 `POST /api/mf-revalidate` (`x-mf-secret` 헤더 + `{"remote":"catalog"}`).

## 팀 설득용 한 줄

> 캐시는 "누가 렌더하느냐"가 아니라 "캐시 스코프가 무엇에 의존하느냐"의 문제다.
> Cache Components 에서 각 스코프는 `cacheTag` 로 의존 remote 를 스스로 선언하고,
> remote CI 는 그 태그 하나만 만료시킨다. MFA 가 추가로 요구하는 배관은 **웹훅 하나**뿐이다.

## 재현용 도구

지연 프록시로 위험 조건을 고정한다 (프로덕션 코드는 건드리지 않는다).

```bash
# remote SSR 번들 앞에 800ms 지연을 넣는 프록시
DELAY_MS=800 node slow-proxy.mjs        # :3011 → :3001

# host 를 그 프록시로 향하게 띄운다
REMOTE_CATALOG_SSR_ENTRY=http://localhost:3011/mf-server.cjs \
MF_REVALIDATE_SECRET=lab-secret pnpm --filter @mfa/host start

# 라운드마다 host 재기동 + fetch-cache 삭제로 콜드 조건 고정
```

`?warm=0` 으로 warm 을 끄면 옛 동작(대조군)이 재현된다.

## 남은 숙제

- [ ] remote 재배포 ↔ 캐시된 HTML 의 hydration mismatch 창 실측 (엔트리 버전 핀 필요)
- [ ] host 멀티 인스턴스에서 세대 카운터 브로드캐스트 (지금은 프로세스 로컬)
- [ ] `/internal/mf-warm` 접근 제어 (지금은 무인증 — 내부망 가정)
- [ ] `/products/[id]` 에 `generateStaticParams` 도입 시 빌드-remote 결합도 측정
