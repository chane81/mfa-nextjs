# 실험 C — MFA 에서 SSR / ISR / Cache Components 비교

**측정일** 2026-08-14 · **Next** 16.3.1 (Turbopack) · **host** 프로덕션 빌드 + `next start`

## 질문

> 런타임 Module Federation 을 쓰면 Next.js 의 캐시 기능(ISR, Cache Components)을 잃는가?

모노레포 단일 Next 앱이라면 당연히 쓰는 기능이다. MFA 를 도입하면서 이걸 못 쓰게 된다면
아키텍처 선택 자체가 반려된다. 그래서 **실측으로 판정**했다.

## 설계

세 라우트가 **완전히 같은 트리**를 렌더한다 — 같은 remote(`catalog/ProductGrid`),
같은 패널. 다른 것은 라우트 세그먼트 설정 한 줄뿐이다.

| 라우트 | main 브랜치 | `experiment/cache-components` 브랜치 |
| --- | --- | --- |
| `/lab/ssr` | `export const dynamic = "force-dynamic"` | `await connection()` (Suspense 안) |
| `/lab/isr` | `export const revalidate = 60` | `"use cache"` + `cacheLife({ revalidate: 60 })` |
| `/lab/cache` | 없음 (공존 불가) | `"use cache"` + `cacheLife("minutes")` + `cacheTag()` |

판정 지표 3개:

1. **서버 렌더 시각이 얼어붙는가** — 캐시 HIT 의 직접 증거
2. **응답 HTML 안에 remote 마크업이 있는가** — 캐시 대상이 remote UI 인지
3. **요청 구간 동안 remote 번들 fetch / eval 이 몇 번인가** — `/api/lab/stats` 계측

## 결과 1 — main 빌드 (cacheComponents off)

빌드 결과: `/lab/isr` 이 `○ (Static)`, Revalidate `1m`. **빌드 시점에 프리렌더됨.**
프리렌더 산출물 `.next/server/app/lab/isr.html` 안에 `Aurora 75`(remote 가 그리는 상품명) 존재.

3회 연속 요청:

| 라우트 | `x-nextjs-cache` | 서버 렌더 시각 | remote 마크업 | TTFB | 번들 fetch/eval |
| --- | --- | --- | --- | --- | --- |
| `/lab/ssr` | – | 매 요청 갱신 | 있음 | 69 → 7 → 6 ms | 2 / 2 |
| `/lab/isr` | **HIT ×3** | **고정** (빌드 시각) | **있음** | 5 → 2 → 2 ms | **0 / 0** |

`/lab/ssr` 의 fetch 2 는 첫 요청의 catalog + cart 다. 2·3회차는 프로세스 캐시가 받아낸다.
`/lab/isr` 은 세 요청 모두 **remote 를 전혀 건드리지 않고** 응답했다.

### on-demand 무효화

`POST /api/mf-revalidate` (`x-mf-secret` 인증):

```
무효화 전     cache=STALE  renderedAt=10:03:36  remote=true
웹훅 200      {"ok":true,"remote":"catalog"}
무효화 직후   cache=MISS   renderedAt=10:05:10  remote=true   ← 재생성됨
1.5초 후      cache=HIT    renderedAt=10:05:10  remote=true
잘못된 시크릿 401
```

## 결과 2 — `experiment/cache-components` 브랜치

빌드 라우트 표:

```
┌ ○ /                    ← force-dynamic 제거 효과로 정적화
├ ○ /cart  ○ /checkout  ○ /debug  ○ /lab
├ ○ /lab/cache                  1m      1h
├ ○ /lab/isr                    1m      1h
├ ◐ /lab/ssr                                  ← Partial Prerender
└ ◐ /products/[id]                            ← Partial Prerender
```

프리렌더 HTML 검사:

| 파일 | remote 마크업 |
| --- | --- |
| `lab/cache.html` | **있음** |
| `lab/isr.html` | **있음** |
| `index.html` | **있음** |
| `lab/ssr.html` | 없음 (의도된 동적 구멍) |

3회 연속 요청:

| 라우트 | `x-nextjs-cache` | 서버 렌더 시각 | remote 마크업 | TTFB | 번들 fetch/eval |
| --- | --- | --- | --- | --- | --- |
| `/lab/ssr` | – | 매 요청 갱신 | 있음 | 73 → 9 → 9 ms | 1 / 1 |
| `/lab/isr` | HIT ×3 | 고정 | 있음 | 5 → 4 → 4 ms | 0 / 0 |
| `/lab/cache` | HIT ×3 | 고정 | 있음 | 4 → 2 → 2 ms | 0 / 0 |

## 발견

### 1. ISR 은 MFA 에서 그대로 동작한다 ✅

캐시된 HTML 에 remote 마크업이 들어간다. 이유는 App Router 렌더 파이프라인 구조다.

```
1) RSC 렌더 → Flight payload   (client component = 참조 + props)
2) SSR      → HTML             (client component 를 서버에서 실행)
```

Full Route Cache 는 **둘 다** 저장한다. `RemoteComponent` 는 client component 지만
2단계에서 서버 실행되므로 remote 마크업이 캐시 대상 HTML 안으로 들어간다.

효과: `mf-server.cjs` fetch + `new Function` 평가가 **요청당 → 재생성 주기당 1회**.
이 아키텍처에서 제일 비싼 구간이라 ISR 이득이 단일 앱보다 오히려 크다.

### 2. Cache Components 는 앱 전역 all-or-nothing ⚠️

`cacheComponents: true` 를 켜면 세그먼트 설정이 전부 컴파일 에러가 된다.

```
Error: Route segment config "revalidate" is not compatible with
       `nextConfig.cacheComponents`. Please remove it.
```

**세 모드를 한 빌드에 공존시킬 수 없다.** 그래서 이 실험도 브랜치를 갈랐다.
"필요에 따라 라우트별로 골라 쓴다"는 그림은 cacheComponents 에서는 성립하지 않는다.
대신 표현을 바꾸면 같은 의도를 전부 낼 수 있다:

| 의도 | 세그먼트 설정 방식 | cacheComponents 방식 |
| --- | --- | --- |
| 요청마다 렌더 | `dynamic = "force-dynamic"` | `await connection()` — **Suspense 안에 있어야 함** |
| N초 재생성 | `revalidate = N` | `"use cache"` + `cacheLife({ revalidate: N })` |
| 이벤트로 무효화 | (없음) | `"use cache"` + `cacheTag()` |

캐시 단위가 **라우트**에서 **함수**로 내려온다.

### 3. cacheComponents 이행 비용은 대부분 MFA 와 무관하다

브랜치에서 실제로 고친 것:

- `SiteHeader` 의 `usePathname()` → Suspense 로 감싸야 함 (`digest: CLIENT_HOOK_DYNAMIC`)
- `/products/[id]` 의 `params` await → Suspense 안으로 이동 (`blocking-prerender-dynamic`)

둘 다 일반 Next 16 앱이면 똑같이 치르는 비용이다. remote 로딩 경로 때문에 추가로
고친 것은 **없었다**.

### 4. 태그는 `"use cache"` 엔트리로 전파되지 않는다 ❌

remote 번들 fetch 에 `next: { tags: ["mf-remote:catalog"] }` 를 달았다.
그 fetch 를 감싼 `"use cache"` 엔트리가 같이 깨지길 기대했지만 **안 깨졌다** (2회 재현).

```
태그만 무효화 → /lab/isr cache=HIT (렌더 시각 그대로)
                /lab/cache cache=HIT (그대로)
경로까지 무효화 → 둘 다 MISS + 재생성
```

**결론: host 가 "어느 라우트가 어느 remote 를 쓰는지" 맵을 직접 관리해야 한다.**
MFA 에서 ISR 을 쓸 때 새로 지는 유일한 실질 부채가 이것이다.

### 5. 간헐 위험 — 재생성 중 스켈레톤이 캐시될 수 있다 ⚠️

무효화 직후 첫 재생성에서 `/lab/isr` 이 remote 마크업 없이 **Suspense fallback 상태로
캐시된 사례를 1회 관측**했다. 그 엔트리는 이후 `cache=HIT` 로 계속 서빙됐다.

콜드 프로세스에서 순서를 바꿔 재시도했을 때는 재현되지 않았다(둘 다 정상).
조건은 "프로세스 번들 캐시 + Data Cache 를 동시에 비운 직후 연속 요청"으로 추정.

대응 후보 (미구현):

- 무효화 웹훅에서 `revalidate` 전에 remote 번들을 **선(先) warm** 하고, 성공한 뒤 경로 무효화
- remote 로드 실패 시 렌더를 throw 시켜 실패한 결과가 캐시에 저장되지 않게 하기

## 재현 방법

```bash
# remote 두 개 빌드 + 기동 (host 빌드 시 프리렌더가 이걸 fetch 한다)
pnpm turbo run build --filter=@mfa/remote-catalog --filter=@mfa/remote-cart
pnpm --filter @mfa/remote-catalog start &   # :3001
pnpm --filter @mfa/remote-cart start &      # :3002

# main — SSR + ISR
pnpm turbo run build --filter=@mfa/host
MF_REVALIDATE_SECRET=lab-secret pnpm --filter @mfa/host start

# cacheComponents — 세 모드 전부
git checkout experiment/cache-components
pnpm turbo run build --filter=@mfa/host --force
```

브라우저는 `/lab` 인덱스에서 세 모드를 비교한다.
계측값은 `GET /api/lab/stats`, 리셋은 `DELETE /api/lab/stats`.

## 팀 설득용 한 줄

> ISR/Cache Components 는 "누가 렌더하느냐"가 아니라 "캐시 키가 뭐냐"의 문제다.
> remote 를 순수 렌더 함수로 유지하면 캐시 정책은 100% host 가 쥔다.
> MFA 가 실제로 빼앗는 건 **자동 무효화 하나**이고, 그건 remote CI 마지막 스텝의
> `curl -XPOST /api/mf-revalidate` 로 되산다.

## 남은 숙제

- [ ] 스켈레톤 캐싱 위험(발견 5) 재현 조건 특정 + warm-then-revalidate 구현
- [ ] remote 재배포 ↔ 캐시된 HTML 의 hydration mismatch 창 실측 (엔트리 버전 핀 필요)
- [ ] remote → 라우트 맵 관리 방식 결정 (수동 목록 vs 렌더 시 수집)
- [ ] host 멀티 인스턴스에서 `invalidateServerBundle` 브로드캐스트
