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

### 6. 간헐 위험 — 재생성 중 스켈레톤이 캐시될 수 있다 ⚠️

무효화 직후 첫 재생성에서 `/lab/isr` 이 remote 마크업 없이 Suspense fallback 상태로
**캐시된 사례를 1회 관측**했다. 그 엔트리는 이후 `HIT` 로 계속 서빙됐다.
콜드 프로세스에서 순서를 바꿔 재시도했을 때는 재현되지 않았다.

대응 후보 (미구현):

- 웹훅에서 remote 번들을 **선(先) warm** 한 뒤 무효화
- remote 로드 실패 시 throw 시켜 실패한 결과가 캐시에 저장되지 않게 하기

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

## 남은 숙제

- [ ] 스켈레톤 캐싱 위험(발견 6) 재현 조건 특정 + warm-then-revalidate 구현
- [ ] remote 재배포 ↔ 캐시된 HTML 의 hydration mismatch 창 실측 (엔트리 버전 핀 필요)
- [ ] host 멀티 인스턴스에서 `invalidateServerBundle` 브로드캐스트
- [ ] `/products/[id]` 에 `generateStaticParams` 도입 시 빌드-remote 결합도 측정
