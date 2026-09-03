# remote 수명주기 — 버전 · 캐시 · 신뢰

remote 는 host 와 **따로 배포된다.** 그래서 단일 앱이라면 빌드 한 번으로 끝났을 문제가
전부 경계를 넘는 문제가 된다. 이 문서는 그 경계에서 무엇을 어떻게 처리하는지를 정리한다.

- 캐시 문제 → "언제 무엇을 버릴지"를 host 가 알아야 한다
- 버전 문제 → "지금 어느 remote 를 보고 있는지"가 확정되어야 한다
- 신뢰 문제 → host **서버**가 남의 코드를 실행한다

설계 근거가 된 실측은 [04-experiments/03-cache-modes.md](../04-experiments/03-cache-modes.md).

## 소유권

| 대상        | 소유                     | 비고                                               |
| ----------- | ------------------------ | -------------------------------------------------- |
| 버전 결정   | remote 빌드              | 빌드 ID(git SHA). `.mf-version` → 자산 경로에 반영 |
| 버전 공표   | remote 배포              | `dist/mf-version.json`                             |
| 자산 서빙   | remote 배포              | `/v<version>/…` immutable, 매니페스트는 no-store   |
| 서명        | remote CI                | 개인키는 여기에만                                  |
| 캐시 정책   | host                     | `"use cache"` + `cacheLife` + `cacheTag`           |
| 무효화 시점 | host (웹훅으로 통보받음) | warm 성공 후에만                                   |
| 서명 검증   | host                     | 공개키는 여기에만                                  |

**remote 는 캐시를 모른다.** 순수 렌더 함수로 두고 캐시 정책은 100% host 가 쥔다.
이 계약이 유지되는 한 remote 를 늘려도 캐시 설계는 그대로다.

## 산출물 배치

```
apps/remote-catalog/dist/          ← 빌드 산출. 최신 한 벌만 남는다
├── mf-version.json                ← 현재 버전 공표 (no-store)
└── v<version>/                    ← 불변. 배포된 뒤 내용이 바뀌지 않는다
    ├── mf-manifest.json           ← 브라우저 MF 런타임
    ├── remoteEntry.js
    ├── assets/…
    └── mf-server.cjs              ← host **서버** 가 받아 실행
        ↓ 컨테이너 부팅 시 복사 (no-clobber)
/data/                             ← 서빙 볼륨. 여기에 옛 버전이 쌓인다
├── mf-version.json                ← 항상 최신으로 교체
├── v<version>/
└── v<이전 버전>/ …                 ← REMOTE_KEEP_VERSIONS 만큼 보존 (기본 5)
```

**보존 개수를 정하는 자리는 볼륨 쪽 하나다.** 빌드 dist 는 `stamp` 가 최신 한 벌만 남기고
정리한다 — 어차피 배포는 이 디렉터리를 볼륨으로 복사하는 것이고, 롤백에 필요한 옛 버전과
캐시된 HTML 이 참조하는 옛 청크는 볼륨에 있다. 예전에는 `stamp` 도 자체 보존 개수를 세었는데,
대상도 수명도 다른 두 값이 이름만 닮아 있어 어느 쪽이 롤백 범위를 정하는지 읽히지 않았다.

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

| #   | 층                           | 담는 것                     | 무효화                                                        |
| --- | ---------------------------- | --------------------------- | ------------------------------------------------------------- |
| 1   | 버전 매니페스트 (Data Cache) | `mf-version.json` 응답      | `revalidateTag(mf-remote-version:<r>, {expire:0})` · TTL 30초 |
| 2   | 번들 응답 (Data Cache)       | `mf-server.cjs` 바이트      | `revalidateTag(mf-remote-bundle:<r>, {expire:0})`             |
| 3   | 평가된 모듈 (프로세스)       | `new Function` 결과         | 버전 변경 · warm 세대 증가                                    |
| 4   | 페이지 (`"use cache"`)       | remote 마크업이 든 HTML/RSC | `revalidateTag(mf-remote:<r>, "max")`                         |

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

### 순서는 CI 가 만든다 — Dokploy 에는 그 개념이 없다

Dokploy 는 앱마다 "이 경로가 바뀌면 나를 빌드해라"(Watch Paths)만 있고 **앱 사이의
의존·순서가 없다.** 한 push 가 세 앱을 동시에 물면 누가 먼저 끝날지 모른다.
공식 문서도 순서가 필요하면 CI 에서 API 로 트리거하라고 말한다
(docs.dokploy.com — Auto deploy > API Method).

```
POST https://<dokploy>/api/application.deploy
  x-api-key: <token>
  { "applicationId": "<id>" }
```

그래서 `.github/workflows/deploy.yml` 이 파이프라인을 쥔다.

```
detect ─┬─ remotes (matrix)  트리거 → `deployment.all` 의 status 가 done 이 될 때까지 대기
        │                     ↓ error 거나 타임아웃이면 여기서 멈춘다
        ├─ host              remote 배포가 끝난 **뒤에** 트리거 (같은 방식으로 대기)
        └─ revalidate        host 를 새로 안 띄웠을 때만 (아래)

완료 판정은 **배포 상태**지 `mf-version.json` 변화가 아니다. 버전은 이미지가 실제로
바뀐 배포에서만 움직이므로, 캐시가 전부 히트한 재배포에서는 영영 안 온다(known-issues I-8).
버전은 그 뒤에 참고로만 확인하고 실패시키지 않는다.

두 job 이 같은 판정을 해야 해서 그 로직은 `.github/actions/dokploy-deploy` 한 벌에 있다.
```

워크플로 본문은 순서(`needs` · `if`)만 남기고 각 단계의 스크립트는 composite action 으로
뺐다 — `detect-targets`(무엇을 배포할지) · `dokploy-deploy`(배포와 완료 대기) ·
`mf-version-check`(버전 공표 관측) · `mf-revalidate`(캐시 무효화). 로컬 action 은
`uses: ./…` 이라 **그 job 이 먼저 `actions/checkout` 을 해야 한다**.

폴링은 **5초** 간격이다. 실측 30건에서 Dokploy 배포는 p50 25초(catalog 21 · cart 19 ·
host 27)고 대기열은 0초다. 그 소요는 거의 전부 **Docker 레이어 하나**가 쓴다 —
배포 로그에서 앱 빌드 레이어가 catalog 15.4초 · host 21.8초고 나머지는 전부 `CACHED`
다. 긴 꼬리가 없어서 감지 지연은 그대로 낭비다. 15초로 돌던 때는 그 낭비가 실작업의
26%(+17초)였다.

**전제: 세 앱의 Autodeploy 를 끈다.** 안 끄면 push 로도 뜨고 API 로도 떠서 이중 배포가
되고 순서 보장이 사라진다.

#### 왜 remote 가 먼저여야 하나 — 버전 스큐

host 는 커밋된 MF DTS 로 컴파일되지만 런타임에는 **배포된** remote 를 받는다.
그래서 host 가 먼저 뜨면 **새 host 코드 + 옛 remote 번들** 조합이 생긴다.
타입 검사는 이걸 못 잡는다 — 양쪽이 같은 커밋의 타입으로 컴파일되기 때문이다.

| props 를 어떻게 바꿨나                 | 옛 remote 컴포넌트에서                          |
| -------------------------------------- | ----------------------------------------------- |
| 옵셔널 prop 추가                       | 모르는 prop 이라 무시 — **에러 없이 옛 동작**   |
| 필수 prop 추가 · 이름 변경 · 타입 변경 | `undefined` 를 받는다 → 오동작 또는 `TypeError` |

터지면 `RemoteBoundary` 가 잡아 그 패널만 에러 상자가 되고 페이지는 산다(200).
**에러가 나는 쪽이 오히려 낫다** — 옵셔널 추가는 아무도 모르게 지나간다.

순서를 고정하면 그 조합 자체가 성립하지 않는다. 남는 건 반대 방향(옛 host + 새 remote)
뿐이고, 그건 **"remote 는 한 배포 주기만큼 하위호환을 유지한다"** 규칙 하나로 덮인다.
그 규칙을 지킬 수 없는 변경(필수 prop 추가 등)은 expand/contract 로 두 번에 나눈다 —
① remote 가 새 것을 옵셔널로 받게 배포 → ② host 가 쓰기 시작 → ③ remote 에서 옛 것 제거.

#### 무효화는 host 를 새로 안 띄웠을 때만 한다

host 를 재배포하면 새 컨테이너가 **빈 캐시**로 뜨므로 첫 요청이 이미 새 remote 로 굽는다.
무효화는 "host 는 그대로인데 remote 만 바뀐" 경우의 것이다.

### warm-then-revalidate

순서가 전부다. 무효화를 먼저 하면 재생성 렌더가 remote 번들을 네트워크로 받는 동안
**Suspense fallback 상태로 캐시에 굳는다.** 그 엔트리는 이후 `HIT` 로 계속 서빙된다.

콜드 프로세스 + 느린 remote(+800ms) 조건에서 결정적으로 재현된다.

| 4라운드              | 스켈레톤이 캐시됨 |
| -------------------- | ----------------- |
| 무효화만             | **4 / 4**         |
| warm-then-revalidate | **0 / 4**         |

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

| 겹                   | 막는 것                            | 기본값                   |
| -------------------- | ---------------------------------- | ------------------------ |
| 오리진 허용 목록     | 아무 데서나 받아 실행              | 설정된 remote 오리진만   |
| 경로 형태 검증       | 절대 URL · 경로 탈출 · 버전 불일치 | 항상                     |
| SRI 무결성 (SHA-384) | 잘린 파일, 번들만 오염된 캐시      | 프로덕션 필수            |
| Ed25519 서명         | **오리진이 통째로 털린 경우**      | `MF_REQUIRE_SIGNATURE=1` |

무결성만으로는 "같은 출처가 준 값끼리의 대조"라 자기 증명에 가깝다. 서명이 그 고리를 끊는다.
그래서 **개인키는 remote CI, 공개키는 host** — 둘이 같은 곳에 있으면 막으려던 걸 못 막는다.

검증은 `node:crypto` 가 아니라 WebCrypto 로 한다. 로더가 브라우저 번들에도 포함되기 때문이다.

### 실측 (변조 후 배포 시도)

| 시나리오                      | 결과 | 서비스                  |
| ----------------------------- | ---- | ----------------------- |
| 정상 배포                     | 200  | 정상                    |
| 번들 바이트 변조              | 502  | 마지막 정상 remote 유지 |
| 매니페스트가 외부 오리진 지정 | 502  | 유지                    |
| 경로 탈출                     | 502  | 유지                    |
| 서명 없이 매니페스트 교체     | 502  | 유지                    |
| 서명 두고 무결성 값만 교체    | 502  | 유지                    |

거부하면서도 서비스는 계속 뜬다. 나쁜 배포를 안 받아들일 뿐이다.

## 운영 레퍼런스

### 환경변수

| 변수                     | 어디에             | 없으면                                                                                        |
| ------------------------ | ------------------ | --------------------------------------------------------------------------------------------- |
| `REMOTE_*_PUBLIC_URL`    | host + 그 remote   | localhost 기본값. SSR 번들 URL · 브라우저 폴백 엔트리 · 오리진 허용 목록이 전부 여기서 나온다 |
| `REMOTE_ALLOWED_ORIGINS` | host               | remote 오리진만 허용(이미 닫힘). 프록시·CDN 을 끼울 때만 넓힌다                               |
| `MF_REVALIDATE_SECRET`   | host + remote CI   | **모든 무효화·warm 요청 거부** (미설정 = 인증 없음이 아니다)                                  |
| `MF_SELF_ORIGIN`         | host               | `http://127.0.0.1:$PORT` 로 자기호출 (보통 이대로 둔다)                                       |
| `MF_REMOTE_PUBLIC_KEY`   | host               | 서명 검증 생략                                                                                |
| `MF_REQUIRE_SIGNATURE=1` | host               | 서명이 없어도 통과                                                                            |
| `MF_REQUIRE_INTEGRITY=0` | host               | (프로덕션 기본은 무결성 필수)                                                                 |
| `MF_SIGNING_KEY`         | **remote CI 전용** | 서명 없이 배포                                                                                |

turbo 는 strict env 라 새 변수는 `turbo.json` 의 `globalEnv` 에도 등록해야 태스크에 전달된다.

### 웹훅 계약

```bash
curl -XPOST "$HOST_URL/api/mf-revalidate" \
  -H "x-mf-secret: $MF_REVALIDATE_SECRET" \
  -H 'content-type: application/json' \
  -d '{"remote":"catalog"}'
```

| 상태 | 뜻                                       | 페이지 캐시 |
| ---- | ---------------------------------------- | ----------- |
| 200  | warm 성공 → 무효화함                     | 갱신됨      |
| 401  | 시크릿 불일치(또는 미설정)               | 그대로      |
| 400  | 알 수 없는 remote 이름                   | 그대로      |
| 502  | remote 도달 실패 · 검증 거부 · 적재 실패 | **그대로**  |

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

- **배포 완료는 Dokploy 가 `done` 이라고 말한 시점이다.** 컨테이너 교체가 몇 초 뒤일 수
  있어, remote 는 그 뒤 최대 120초 동안 `mf-version.json` 변화를 참고로만 본다.
  그 창 안에 안 바뀌면 "이미지 재사용" 으로 보고 넘어간다 — 실패시키지 않는다.
- **멀티 인스턴스 무효화는 TTL 만큼 지연된다.** 웹훅은 한 인스턴스에만 닿는다.
  즉시성이 필요하면 공유 캐시 핸들러를 붙여야 한다.
- **호스트 빌드가 remote 기동에 의존한다.** Cache Components 에서 `generateStaticParams` 가
  빈 배열을 못 주기 때문에 프리렌더가 remote 를 필요로 한다.
- **서명은 매니페스트까지만 보장한다.** 웹 청크 하나하나의 무결성은 브라우저 SRI 로
  따로 걸어야 한다(미구현).
- **`/internal/mf-warm` 은 내부 라우트다.** proxy 시크릿으로 막혀 있지만
  네트워크 레벨에서도 외부에 노출하지 않는 편이 낫다.
