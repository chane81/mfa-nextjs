# remote 수명주기 — 버전 · 캐시 · 신뢰

remote 는 host 와 **따로 배포된다.** 그래서 단일 앱이라면 빌드 한 번으로 끝났을 문제가
전부 경계를 넘는 문제가 된다. 이 문서는 그 경계에서 무엇을 어떻게 처리하는지를 정리한다.

- 캐시 문제 → "언제 무엇을 버릴지"를 host 가 알아야 한다
- 버전 문제 → "지금 어느 remote 를 보고 있는지"가 확정되어야 한다
- 신뢰 문제 → host **서버**가 남의 코드를 실행한다

설계 근거가 된 실측은 [04-experiments/03-cache-modes.md](../04-experiments/03-cache-modes.md).

## 소유권

| 대상 | 소유 | 비고 |
| --- | --- | --- |
| 버전 결정 | remote 빌드 | 빌드 ID(git SHA). `.mf-version` → 자산 경로에 반영 |
| 버전 공표 | remote 배포 | `dist/mf-version.json` |
| 자산 서빙 | remote 배포 | `/v<version>/…` immutable, 매니페스트는 no-store |
| 서명 | remote CI | 개인키는 여기에만 |
| 캐시 정책 | host | `"use cache"` + `cacheLife` + `cacheTag` |
| 무효화 시점 | host (웹훅으로 통보받음) | warm 성공 후에만 |
| 서명 검증 | host | 공개키는 여기에만 |

**remote 는 캐시를 모른다.** 순수 렌더 함수로 두고 캐시 정책은 100% host 가 쥔다.
이 계약이 유지되는 한 remote 를 늘려도 캐시 설계는 그대로다.

## 산출물 배치

```
apps/remote-catalog/dist/
├── mf-version.json              ← 현재 버전 공표 (no-store)
├── v<version>/                  ← 불변. 배포된 뒤 내용이 바뀌지 않는다
│   ├── mf-manifest.json         ← 브라우저 MF 런타임
│   ├── remoteEntry.js
│   ├── assets/…
│   └── mf-server.cjs            ← host **서버** 가 받아 실행
└── v<이전 버전>/ …               ← 3개까지 보존 (롤백 + 캐시된 HTML 의 hydration)
```

`mf-version.json`:

```json
{
  "remote": "catalog",
  "version": "21418fe2d1-mst2drrz",
  "ssrEntry": "/v21418fe2d1-mst2drrz/mf-server.cjs",
  "webEntry": "/v21418fe2d1-mst2drrz/mf-manifest.json",
  "ssrIntegrity": "sha384-…",
  "webIntegrity": "sha384-…",
  "contentHash": "7f2218ba9c61",
  "signature": "…"
}
```

### 왜 버전이 내용 해시가 아닌가

자산 URL 접두사는 빌드 **전에** 정해져야 하는데 내용 해시는 빌드가 끝나야 나온다. 순환이다.
그래서 버전은 빌드 ID 로 잡고 내용 해시는 `contentHash` 로 따로 싣는다.

부수 효과는 **의도한 것**이다. 소스가 그대로여도 재배포하면 새 버전이 된다 —
메모리·스토리지 압박으로 인스턴스를 갈아엎는 운영성 배포에서 host 가 확실히 갈아탄다.
"내용이 같으니 갈아탈 필요 없다"고 판단해버리면 그런 배포가 무의미해진다.

### 왜 옛 버전을 남기나

캐시된 HTML 은 **자기가 만들어진 시점의 버전**을 가리킨다. 그 자산이 사라지면
브라우저가 hydration 단계에서 404 를 맞는다(실제로 dist 를 통째로 지웠다가 재현했다).
캐시 수명(최대 `expire`)만큼은 옛 버전이 살아 있어야 한다.

## 캐시 네 층

host 안에서 remote 와 관련된 캐시는 네 겹이고, 무효화 수단이 각각 다르다.

| # | 층 | 담는 것 | 무효화 |
| --- | --- | --- | --- |
| 1 | 버전 매니페스트 (Data Cache) | `mf-version.json` 응답 | `revalidateTag(mf-remote-version:<r>, {expire:0})` · TTL 30초 |
| 2 | 번들 응답 (Data Cache) | `mf-server.cjs` 바이트 | `revalidateTag(mf-remote-bundle:<r>, {expire:0})` |
| 3 | 평가된 모듈 (프로세스) | `new Function` 결과 | 버전 변경 · warm 세대 증가 |
| 4 | 페이지 (`"use cache"`) | remote 마크업이 든 HTML/RSC | `revalidateTag(mf-remote:<r>, "max")` |

**태그가 왜 세 개인가.** 하나로 묶으면 순서를 못 만든다. 번들을 깨는 순간 페이지도 같이 깨져서
재생성이 warm 보다 먼저 일어난다. 그러면 재생성 렌더가 remote 를 기다리다
Suspense fallback 상태로 캐시에 굳는다.

**1·2 는 `{expire: 0}`, 4 는 `"max"`.** `"max"` 는 stale-while-revalidate 라 다음 읽기가
옛 값을 그대로 돌려준다. 번들 계층에서 그러면 warm 이 **옛 코드**를 데우고, remote 가 죽어
있어도 옛 바이트로 "성공"해버려 장애를 못 잡는다. 페이지 계층에서는 반대로 SWR 이 맞다 —
사용자에게 잠깐 옛 화면을 보여주더라도 응답은 빠른 편이 낫다.

**3 은 Next 가 모른다.** `revalidateTag` 로는 안 깨진다. 버전 문자열과 warm 세대로 관리한다.

### 캐시는 레이어별, 신호는 globalThis

`bundleCache` 를 RSC 레이어와 SSR 레이어가 공유하면 안 된다. Next 는 두 레이어의 모듈
그래프를 분리하고, 각 레이어의 `import * as React` 가 서로 다른 React 빌드로 해석된다.
평가된 remote 번들에는 그 레이어의 React 가 주입돼 있어서, 공유하면 `useState` 가 깨진다.

반대로 무효화 신호는 모든 레이어에 닿아야 한다. Route Handler(RSC 레이어)가 재배포를
통보받아도 페이지를 렌더하는 SSR 레이어의 Map 은 그대로이기 때문이다.

→ **캐시는 레이어별 모듈 스코프, 문자열 신호만 globalThis.**
같은 이유로 warm 은 반드시 client component 경유여야 한다 — 번들을 평가하는 로더
인스턴스가 그 레이어에 있다.

## 배포 수명주기

```
remote CI                          host (인스턴스 N개)
─────────                          ──────────────────
빌드
  버전 결정 (git SHA)
  /v<version>/ 로 산출물
  mf-version.json 서명·공표
        │
        ├── 통보 없음 ───────────►  각 인스턴스가 TTL(30초) 안에
        │                           mf-version.json 을 다시 읽어 수렴
        │                           ※ 이것만으로 정확성이 성립한다
        │
        └── POST /api/mf-revalidate ─►  ① 버전·번들 태그 즉시 만료
            (x-mf-secret)               ② remote 생존 확인 = 매니페스트 재조회
                                           실패 → 502, 페이지 캐시 그대로
                                        ③ warm: /internal/mf-warm 자체 호출
                                           SSR 레이어에서 새 번들 평가·검증
                                           실패 → 502, 페이지 캐시 그대로
                                        ④ 페이지 태그 무효화 (여기서 처음)
```

**웹훅은 최적화다.** 없어도 모든 인스턴스가 TTL 안에 수렴한다(실측 30초).
웹훅은 그 수렴을 즉시로 당길 뿐이고, 그래서 웹훅 유실이 정합성 문제가 되지 않는다.

### warm-then-revalidate

순서가 전부다. 무효화를 먼저 하면 재생성 렌더가 remote 번들을 네트워크로 받는 동안
**Suspense fallback 상태로 캐시에 굳는다.** 그 엔트리는 이후 `HIT` 로 계속 서빙된다.

콜드 프로세스 + 느린 remote(+800ms) 조건에서 결정적으로 재현된다.

| 4라운드 | 스켈레톤이 캐시됨 |
| --- | --- |
| 무효화만 | **4 / 4** |
| warm-then-revalidate | **0 / 4** |

warm 이 실패하면 페이지 캐시를 건드리지 않고 502 로 중단한다.
**옛 화면이 스켈레톤보다 낫다.**

### warm 이 지켜야 하는 것

- **캐시를 믿지 않는다.** warm 세대를 올려 매번 다시 받아 다시 검증한다.
  안 그러면 "같은 버전인데 바이트가 바뀐" 경우(변조·깨진 배포)를 통과시킨다.
- **성공 판정은 HTTP 상태가 아니다.** warm 페이지의 remote 는 `RemoteBoundary` 안이라
  remote 가 죽어도 200 이 나온다. "이번 warm 세대에 이 버전을 적재했는가"로 판정한다.
- **버전을 재해석하지 않는다.** 버전을 정하는 곳은 웹훅과 레이아웃 둘뿐이다.

## 신뢰 경계

host 서버가 remote 코드를 `new Function` 으로 실행한다. 브라우저에서 remote 청크를 실행하는
것과 신뢰 수준은 같지만, 뚫렸을 때 영향 범위가 서버 프로세스라는 점이 다르다.

`mf-version.json` 은 **remote 가 주는 값**이다. 그대로 믿으면 "다른 오리진에서 받아 실행하라"는
지시를 그대로 따르게 된다.

| 겹 | 막는 것 | 기본값 |
| --- | --- | --- |
| 오리진 허용 목록 | 아무 데서나 받아 실행 | 설정된 remote 오리진만 |
| 경로 형태 검증 | 절대 URL · 경로 탈출 · 버전 불일치 | 항상 |
| SRI 무결성 (SHA-384) | 잘린 파일, 번들만 오염된 캐시 | 프로덕션 필수 |
| Ed25519 서명 | **오리진이 통째로 털린 경우** | `MF_REQUIRE_SIGNATURE=1` |

무결성만으로는 "같은 출처가 준 값끼리의 대조"라 자기 증명에 가깝다. 서명이 그 고리를 끊는다.
그래서 **개인키는 remote CI, 공개키는 host** — 둘이 같은 곳에 있으면 막으려던 걸 못 막는다.

검증은 `node:crypto` 가 아니라 WebCrypto 로 한다. 로더가 브라우저 번들에도 포함되기 때문이다.

### 실측 (변조 후 배포 시도)

| 시나리오 | 결과 | 서비스 |
| --- | --- | --- |
| 정상 배포 | 200 | 정상 |
| 번들 바이트 변조 | 502 | 마지막 정상 remote 유지 |
| 매니페스트가 외부 오리진 지정 | 502 | 유지 |
| 경로 탈출 | 502 | 유지 |
| 서명 없이 매니페스트 교체 | 502 | 유지 |
| 서명 두고 무결성 값만 교체 | 502 | 유지 |

거부하면서도 서비스는 계속 뜬다. 나쁜 배포를 안 받아들일 뿐이다.

## 운영 레퍼런스

### 환경변수

| 변수 | 어디에 | 없으면 |
| --- | --- | --- |
| `REMOTE_CATALOG_SSR_ENTRY` / `REMOTE_CART_SSR_ENTRY` | host | localhost 기본값. 오리진 허용 목록의 기본값도 여기서 나온다 |
| `NEXT_PUBLIC_REMOTE_*_ENTRY` | host | 버전 정보가 없을 때의 브라우저 폴백 |
| `REMOTE_ALLOWED_ORIGINS` | host | remote 오리진만 허용(이미 닫힘). 프록시·CDN 을 끼울 때만 넓힌다 |
| `MF_REVALIDATE_SECRET` | host + remote CI | **모든 무효화·warm 요청 거부** (미설정 = 인증 없음이 아니다) |
| `MF_REMOTE_PUBLIC_KEY` | host | 서명 검증 생략 |
| `MF_REQUIRE_SIGNATURE=1` | host | 서명이 없어도 통과 |
| `MF_REQUIRE_INTEGRITY=0` | host | (프로덕션 기본은 무결성 필수) |
| `MF_SIGNING_KEY` | **remote CI 전용** | 서명 없이 배포 |
| `MF_BUILD_VERSION` | remote CI | git SHA → 타임스탬프 순으로 폴백 |

turbo 는 strict env 라 새 변수는 `turbo.json` 의 `globalEnv` 에도 등록해야 태스크에 전달된다.

### 웹훅 계약

```bash
curl -XPOST "$HOST_URL/api/mf-revalidate" \
  -H "x-mf-secret: $MF_REVALIDATE_SECRET" \
  -H 'content-type: application/json' \
  -d '{"remote":"catalog"}'
```

| 상태 | 뜻 | 페이지 캐시 |
| --- | --- | --- |
| 200 | warm 성공 → 무효화함 | 갱신됨 |
| 401 | 시크릿 불일치(또는 미설정) | 그대로 |
| 400 | 알 수 없는 remote 이름 | 그대로 |
| 502 | remote 도달 실패 · 검증 거부 · 적재 실패 | **그대로** |

쿼리: `?paths=1` 캐시 스코프 없는 정적 라우트까지 무효화 · `?warm=0` warm 생략(실험용).

### 진단

```bash
curl -s "$HOST_URL/api/lab/stats?refresh=1" | jq
# versions : 이 인스턴스가 아는 remote 버전
# entries  : 실제로 쓰는 SSR 엔트리 URL
# stats    : 번들 fetch / eval / 성공 로드 횟수
```

`/lab` 에 SSR · ISR 등가 · 태그 무효화 세 모드를 나란히 두고 캐시 동작을 눈으로 비교할 수 있다.

## 알려진 한계

- **멀티 인스턴스 무효화는 TTL 만큼 지연된다.** 웹훅은 한 인스턴스에만 닿는다.
  즉시성이 필요하면 공유 캐시 핸들러를 붙여야 한다.
- **호스트 빌드가 remote 기동에 의존한다.** Cache Components 에서 `generateStaticParams` 가
  빈 배열을 못 주기 때문에 프리렌더가 remote 를 필요로 한다.
- **서명은 매니페스트까지만 보장한다.** 웹 청크 하나하나의 무결성은 브라우저 SRI 로
  따로 걸어야 한다(미구현).
- **`/internal/mf-warm` 은 내부 라우트다.** proxy 시크릿으로 막혀 있지만
  네트워크 레벨에서도 외부에 노출하지 않는 편이 낫다.
