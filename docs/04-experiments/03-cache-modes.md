# 실험 C — MFA 에서 ISR / Cache Components

**측정일** 2026-08-14 · **Next** 16.3.1 (Turbopack) · **host** 프로덕션 빌드 + `next start`

## 질문

> 런타임 Module Federation 을 쓰면 Next.js 의 캐시 기능을 잃는가?

모노레포 단일 Next 앱이라면 당연히 쓰는 기능이다. MFA 를 도입하면서 못 쓰게 된다면
아키텍처 선택 자체가 반려된다. **실측으로 판정했다. 답은 "잃지 않는다".**

## 전제 — Next 16 은 세그먼트 설정을 버렸다

먼저 바로잡을 것. `export const dynamic = "force-dynamic"` 은 **Next 16 에서 더 이상 쓰지 않는다.**
[공식 이행 가이드](https://nextjs.org/docs/app/guides/migrating-to-cache-components) 기준 매핑:

| 옛 방식                                    | Next 16 (Cache Components)                                                                        |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| `dynamic = "force-dynamic"`                | **삭제.** 캐시하지 않으면 기본이 동적. 요청 시점 실행이 꼭 필요하면 `connection()` + `<Suspense>` |
| `dynamic = "force-static"` (Route Handler) | `"use cache"` 헬퍼 함수로 분리                                                                    |
| `revalidate = N`                           | `"use cache"` + `cacheLife(...)`                                                                  |
| `fetchCache`                               | 삭제                                                                                              |
| `experimental_ppr`                         | 삭제. PPR 이 Cache Components 에 흡수                                                             |
| `dynamicParams`                            | 미지원. 삭제                                                                                      |
| `unstable_noStore()`                       | 삭제. 기본이 uncached                                                                             |
| `unstable_cache(fn, keys, opts)`           | `"use cache"` + `cacheLife` + `cacheTag`                                                          |

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

| 라우트       | 캐시 선언                                             | 옛 표현                     |
| ------------ | ----------------------------------------------------- | --------------------------- |
| `/lab/ssr`   | `await connection()` + `<Suspense>`                   | `dynamic = "force-dynamic"` |
| `/lab/isr`   | `"use cache"` + `cacheLife({revalidate:60})`          | `revalidate = 60`           |
| `/lab/cache` | `"use cache"` + `cacheLife("minutes")` + `cacheTag()` | (없음)                      |

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

| 파일             | remote 마크업           |
| ---------------- | ----------------------- |
| `lab/cache.html` | **있음**                |
| `lab/isr.html`   | **있음**                |
| `index.html`     | **있음**                |
| `lab/ssr.html`   | 없음 (의도된 동적 구멍) |

3회 연속 요청:

| 라우트       | `x-nextjs-cache` | 서버 렌더 시각 | remote 마크업 | TTFB           | 번들 fetch/eval |
| ------------ | ---------------- | -------------- | ------------- | -------------- | --------------- |
| `/lab/ssr`   | –                | 매 요청 갱신   | 있음          | 74 → 10 → 9 ms | 1 / 1           |
| `/lab/isr`   | HIT ×3           | **고정**       | **있음**      | 5 → 2 → 2 ms   | **0 / 0**       |
| `/lab/cache` | HIT ×3           | **고정**       | **있음**      | 6 → 4 → 3 ms   | **0 / 0**       |

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
_"Tag data with `cacheTag` inside a `use cache` function instead of the `fetch` `next.tags` option."_

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
host 는 _어느 라우트가 어느 remote 를 쓰는지_ 맵을 관리할 필요가 없다.
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
| ----------------------------------------- | ----------------- |
| A. 무효화만 (`?warm=0`)                   | **4 / 4**         |
| B. warm-then-revalidate                   | **0 / 4**         |

#### 고친 방식 — warm-then-revalidate

웹훅이 세 단계를 순서대로 밟는다.

1. **번들 계층만 무효화** — 버전·번들 태그를 `{ expire: 0 }` 으로 즉시 만료
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
안에 있어서 remote 가 죽어도 200 이 나온다. 처음엔 globalThis 계측기의 성공 로드 카운터
증가로 판정했는데, 버전 도입 후 오탐이 생겨 다시 고쳤다 → 발견 8.

**(d) `lazy()` 캐시가 옛 remote 를 프로세스 수명 내내 고정한다.** ← 제일 지독했다.
`RemoteComponent` 는 모듈 스코프 Map 에 `lazy(() => loadRemoteModule(id))` 를 캐시한다.
React 의 `lazy()` 는 한 번 resolve 되면 결과를 영구히 들고 있으므로, 번들 캐시를 아무리 비워도
로더가 다시 불리지 않는다. warm 요청이 네트워크를 전혀 타지 않는 형태로 드러났다.

```
warm#1  → fetches 0 → 1   (첫 로드)
bump    → 무효화 신호
warm#2  → fetches 1 → 1   ❌ 로더가 안 불림
```

lazy 캐시 키에 remote 버전을 넣어 고쳤다 (`${id}@${version}`). 고친 뒤:

```
warm#2  → fetches 1 → 2   ✅
```

### 7. warm 라우트는 인증이 필요하고, 그 인증은 proxy 여야 한다 🔒

`/internal/mf-warm` 은 요청 하나로 host 서버가 remote 번들을 받아 **`new Function` 으로
실행**하게 만든다. 무인증이면 서버사이드 코드 실행 경로를 외부에서 트리거할 수 있고,
반복 호출로 remote 재fetch·재평가를 강제하는 증폭 벡터가 된다.

문제는 **어디서 막느냐**였다. 페이지 컴포넌트 안에서 `notFound()` 를 불러도 상태 코드가
**200 으로 나간다** — 그 시점엔 루트 레이아웃이 이미 flush 되기 시작해 헤더가 확정된 뒤다.
`instant = false` 로 PPR 셸을 없애도 결과는 같았다.

| 막는 위치                                  | 미인증 요청 결과        |
| ------------------------------------------ | ----------------------- |
| 페이지 안 `notFound()` (PPR)               | `200` + 본문만 404 화면 |
| 페이지 안 `notFound()` + `instant = false` | `200`                   |
| **proxy**                                  | **`404`**               |

proxy 는 렌더 파이프라인 진입 전에 돌아 진짜 404 를 낸다. 페이지 안 검사도 그대로
남겨뒀다 — matcher 가 틀어져도 뚫리지 않도록.

시크릿 비교는 상수시간으로 하되 `node:crypto` 는 안 쓴다. proxy 가 edge 런타임에서
돌 수 있어 node builtin 을 못 쓰기 때문이다. 시크릿이 **미설정이면 전부 거부**한다
(미설정을 "인증 없음"으로 읽으면 환경변수 빠뜨린 배포가 조용히 열린다).

```
헤더 없음        404      틀린 시크릿     404
길이 다른 시크릿  404      맞는 시크릿     200 (warm 수행)
시크릿 미설정     전부 404 · 웹훅도 401
```

### 8. remote 버전 핀 — 신호를 전파하는 대신 상태를 같은 곳에서 읽는다 📌

앞선 설계는 프로세스 안 세대 카운터로 무효화를 전파했다. host 를 여러 인스턴스로 띄우면
**웹훅이 닿은 인스턴스만** 갱신되고 나머지는 재시작 전까지 옛 remote 를 서빙한다.

바꾼 방식: remote 가 자기 버전을 **공표**하고, 모든 인스턴스가 그걸 읽는다.

```
remote 빌드
  scripts/mf-build-version.ts   빌드 전: 버전 결정 → .mf-version
  vite build / rsbuild build     base·assetPrefix = /v<version>/, 출력도 dist/v<version>/
  scripts/stamp-remote-version.ts
    dist/mf-version.json         { version, ssrEntry, webEntry, contentHash } 공표
```

#### 왜 버전이 내용 해시가 아니라 빌드 ID 인가

자산 URL 접두사는 빌드 **전에** 정해져야 하는데 내용 해시는 빌드가 끝나야 나온다. 순환이다.
그래서 버전은 빌드 ID(CI 면 git SHA)로 잡고, 내용 해시는 `contentHash` 로 함께 공표한다.

부수 효과는 **의도한 것**이다. 소스가 그대로여도 재배포하면 새 버전이 된다 —
메모리·스토리지 압박으로 초기화 배포를 하는 운영 상황에서 host 가 확실히 갈아탄다.
"내용이 같으니 갈아탈 필요 없다"고 판단해버리면 그런 배포가 무의미해진다.

#### 실측

| 확인                                       | 결과                                                |
| ------------------------------------------ | --------------------------------------------------- |
| 서버 엔트리                                | `http://localhost:3001/v<version>/mf-server.cjs`    |
| 브라우저 엔트리                            | `http://localhost:3001/v<version>/mf-manifest.json` |
| 매니페스트 안 `publicPath`                 | `http://localhost:3001/v<version>/`                 |
| 브라우저 remote 요청 17건 중 버전 경로     | **17건** (버전 없음 0건)                            |
| 콘솔 에러/경고                             | **0건**                                             |
| 페이지 10회 요청 중 `mf-version.json` 조회 | **1회**                                             |

#### 웹훅 없이 수렴하는가

인스턴스 A(:3000)와 B(:3010)를 띄우고 **아무 통보도 하지 않은 채** remote 만 재배포:

```
+  0s  A=…mst10wm1  B=…mst10wm1
+ 25s  A=…mst10wm1  B=…mst10wm1
+ 30s  A=…mst11vbo ✅  B=…mst11vbo ✅
```

TTL(30초)에 맞춰 둘 다 수렴한다. **브로드캐스트가 필요 없다.**
웹훅은 이 수렴을 앞당기는 최적화일 뿐 정확성의 전제가 아니다.

#### 롤백

`mf-version.json` 을 옛 버전으로 되돌리기만 하면 된다. 자산은 3개 버전까지 남겨둔다.

```
롤백  → 웹훅 200 version=…rq7v → 캐시 MISS → 새로 렌더 → HIT
브라우저 재확인: 버전 경로 17/17, 콘솔 에러 0
롤포워드 → 웹훅 200 version=…uf9j → 동일
```

보존이 왜 필요한지는 실수로 확인했다. dist 를 통째로 지우자 **캐시에 남아 있던 옛 HTML 이
가리키는 버전 경로가 404** 나면서 remote 가 렌더되지 않았다. 캐시된 HTML 의 수명만큼은
그 버전의 자산이 살아 있어야 한다.

#### 이 과정에서 또 드러난 함정 2개

**(a) warm 중에는 버전을 재조회하면 안 된다.** SSR 레이어가 `mf-version.json` 을 다시 읽으면
Data Cache 의 옛 응답을 집어 웹훅이 방금 정한 버전을 덮어썼다. 롤포워드 웹훅이
"공표=새 버전, 적재=옛 버전"으로 실패했다. 버전 갱신 책임을 레이아웃과 웹훅으로 좁히고,
로더는 아는 버전을 쓰기만 한다(콜드일 때만 직접 조회).

**(b) 롤백은 `lazy()` 캐시에 걸린다.** 되돌아간 버전의 lazy 엔트리가 이미 남아 있어
로더가 아예 호출되지 않고, 그래서 "무엇을 적재했는지"가 갱신되지 않아 warm 이 실패로 보였다.
warm 요청에 nonce 를 실어 lazy 캐시를 우회한다(warm 경로 전용).

### 9. remote 신뢰 경계 — 세 겹, 실제로 공격해서 확인 🔒

host **서버**가 remote 코드를 받아 `new Function` 으로 실행한다. 브라우저에서 remote 청크를
실행하는 것과 신뢰 수준은 같지만, 뚫렸을 때 영향 범위가 서버 프로세스라는 점이 다르다.

세 겹으로 막는다. 뒤로 갈수록 강하고, 앞의 것 없이는 뒤의 것도 의미가 없다.

| 겹               | 막는 것                               | 기본값                             |
| ---------------- | ------------------------------------- | ---------------------------------- |
| 오리진 허용 목록 | 아무 데서나 받아 실행하는 것          | 설정된 remote 오리진만 (이미 닫힘) |
| 경로 형태 검증   | 절대 URL·경로 탈출·버전 불일치        | 항상                               |
| 무결성(SRI)      | 배포 중 잘린 파일, 번들만 오염된 캐시 | 프로덕션에서 필수                  |
| 서명(Ed25519)    | **remote 오리진이 통째로 털린 경우**  | `MF_REQUIRE_SIGNATURE=1` 로 강제   |

`mf-version.json` 은 **remote 가 주는 값**이다. 그대로 믿으면 "다른 오리진에서 받아 실행하라"는
지시를 그대로 따르게 된다. 그래서 경로를 먼저 좁히고, 서명으로 출처를 확인하고,
받은 바이트를 평가 **전에** 대조한다.

서명 없이 무결성만 쓰면 "같은 출처가 준 값끼리의 대조"라 자기 증명에 가깝다.
그래서 개인키는 remote 빌드 파이프라인, 공개키는 host 배포에 둔다 —
둘이 같은 곳에 있으면 막으려던 것을 못 막는다.

```bash
node scripts/gen-signing-key.ts      # 키쌍 생성
# remote CI :  MF_SIGNING_KEY=<private>
# host      :  MF_REMOTE_PUBLIC_KEY=<public>  MF_REQUIRE_SIGNATURE=1
```

#### 실제로 변조해서 검증

remote 산출물을 진짜로 고치고 배포 웹훅을 때렸다. 502 = "host 가 이 배포를 거부했다".

| 시나리오                          | 결과                    | 페이지                  |
| --------------------------------- | ----------------------- | ----------------------- |
| 정상 배포 (대조군)                | 200                     | 정상                    |
| 번들 바이트 변조                  | **502** 적재 실패       | 마지막 정상 remote 유지 |
| 매니페스트가 외부 오리진 지정     | **502** 매니페스트 거부 | 유지                    |
| 경로 탈출(`/v…/../../etc/passwd`) | **502** 매니페스트 거부 | 유지                    |
| 서명 없이 매니페스트 교체         | **502** 매니페스트 거부 | 유지                    |
| 서명 그대로 두고 무결성 값만 교체 | **502** 매니페스트 거부 | 유지                    |

중요한 건 마지막 열이다. **거부하면서도 서비스는 계속 뜬다.** 나쁜 배포를 안 받아들일 뿐,
마지막 정상 remote 로 계속 렌더한다.

#### 이 과정에서 또 드러난 것 3개

**(a) warm 은 캐시를 믿으면 안 된다.** 처음엔 번들 변조가 통과했다 — 버전이 그대로라
프로세스 캐시가 히트해 재검증 자체가 일어나지 않았다. warm 은 "이 배포를 적재할 수 있는가"를
증명하는 절차이므로, warm 세대를 올려 **매번 다시 받아 다시 검증**한다.

**(b) "적재됨" 판정에 시점이 필요하다.** 버전만 비교하면 예전에 같은 버전을 적재해 둔 상태를
성공으로 오인한다. 실제로 무결성 검사는 막았는데 웹훅은 200 을 돌려줬다.
적재 기록에 warm 세대를 함께 남겨 "이번 warm 에서 적재했는가"를 본다.

**(c) 버전 정보를 재구성하면 안 된다.** warm 페이지가 쿼리로 받은 버전으로 매니페스트를
재구성해 전역에 덮어썼는데, 그 재구성본에는 무결성 값이 없어 **두 번째 웹훅부터** 로드가
거부됐다. 버전을 정하는 곳은 웹훅과 레이아웃 둘뿐으로 좁혔다.

#### 곁다리로 잡힌 hydration 버그

버전 스크립트를 `<Suspense>` 안에 두었더니 셸 **뒤에** 스트리밍돼서, 브라우저 MF 런타임이
초기화될 때 값이 없어 버전 없는 폴백 엔트리로 붙었다(매니페스트 404 + CORS 에러, remote 렌더 실패).
`"use cache"` 로 셸의 일부로 만들어 hydration 보다 먼저 도착하게 고쳤다.
캐시된 페이지가 옛 버전을 들고 있는 건 맞는 동작이다 — 그 HTML 은 그 버전으로 만들어졌고,
웹훅이 같은 태그를 만료시키므로 페이지와 함께 갱신된다.

### 9. 캐시는 레이어별로, 무효화 신호는 globalThis 로

`bundleCache` 를 레이어 간에 공유하면 안 된다. Next 는 RSC 레이어와 SSR 레이어의
모듈 그래프를 분리하고 각 레이어의 `import * as React` 가 다른 React 빌드로 해석된다.
평가된 remote 번들에는 그 레이어의 React 가 주입돼 있어서, 공유하면 `useState` 가 깨진다.

반대로 무효화 신호는 모든 레이어에 닿아야 한다. Route Handler(RSC 레이어)가 재배포를
통보받아도 페이지를 렌더하는 SSR 레이어의 캐시는 그대로이기 때문이다.

→ **캐시는 레이어별 모듈 스코프, 버전 문자열만 globalThis.**
버전이 바뀌면 각 레이어가 다음 접근에서 스스로 캐시를 버린다.
(처음엔 프로세스 안 세대 카운터를 썼다가, 멀티 인스턴스 때문에 remote 가 공표하는
버전으로 바꿨다 — 발견 8)

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

- [x] remote 엔트리 버전 핀 + 멀티 인스턴스 수렴 → 발견 8
- [x] 웹 자산까지 불변 접두사로 배포 → 발견 8
- [x] 롤백 실측 → 발견 8
- [x] remote origin 허용 목록 + 무결성/서명 검증 → 발견 9
- [ ] `/products/[id]` 에 `generateStaticParams` 도입 시 빌드-remote 결합도 측정
