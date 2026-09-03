# 진행 상황

## 2026-09-03 (33차) — 수량 상한이 저장 경계에만 있어 화면이 그 위로 올라갔다

32차의 폴링 개선을 **실제 빌드가 도는 배포**에서 재려면 remote 소스가 바뀌어야 했다.
그래서 고칠 것을 찾다가 진짜 버그를 하나 밟았다.

### 버그 — 화면 100, 쿠키 99

쿠키 코덱은 수량을 `MAX_CART_QUANTITY`(99)로 자른다(`cookie-codec.ts:111`). 스토어의
`setQuantity` 는 **안 자른다.** 그건 의도된 비대칭이고 `create-store.test.tsx` 에 근거가
적혀 있다 — 상한은 "사용자가 고칠 수 있는 입력" 을 막는 **저장 경계**의 규칙이라 거기
한 곳에만 둔다.

그러면 그 위로 못 올라가게 막는 일이 **화면 몫으로 남는데, 아무도 안 했다.**

```
+ 를 100까지 누른다 → 화면 100 → 쿠키 저장 시 99 로 잘림 → 새로고침하면 99
```

에러가 안 난다. 조용히 되돌아갈 뿐이라 더 나쁘다.

### 고친 곳 — 양쪽 remote

같은 버그의 두 면이라 한 벌로 고쳤다. 담는 자리와 늘리는 자리가 서로 다른 remote 다.

| remote  | 자리                    | 무엇                                           |
| ------- | ----------------------- | ---------------------------------------------- |
| catalog | `ProductCard` 의 `담기` | 99 개 담긴 상품은 잠기고 라벨이 `가득` 이 된다 |
| cart    | `CartPanel` 의 `+`      | 99 에서 멈춘다                                 |

catalog 쪽은 `useHydrated` 로 한 번 거른다. 스토어의 서버 스냅샷은 빈 장바구니라
하이드레이션 렌더까지는 담긴 수량을 모른다 — 그 전에 판정하면 서버가 그린 버튼과 첫
클라이언트 렌더가 갈린다.

### 하려다 만 것 — `aria-label`

카드 8장에 `담기` 버튼이 8개라 스크린리더에서 구분이 안 된다. 상품 이름을 붙이려 했는데
`@mfa/ui` 의 `Button` 이 `aria-label` 을 안 받는다. 고치려면 `packages/` 를 건드려야 하고,
그러면 **host 까지 재배포된다**(detect 규칙). 이번 회차의 목적이 "remote 둘만 배포되는
경로" 를 재는 것이라 미뤘다.

### 이 배포로 처음 도는 것

`mf-revalidate` 다. host 를 안 건드린 remote 전용 배포에서만 도는 job 이라
(`needs.detect.outputs.host != 'true'`) 30차에 분리한 뒤로 계속 skip 이었다.

## 2026-09-03 (32차) — 배포가 실제로 얼마나 걸리는지 재고 폴링을 맞춘다

31차에서 파이프라인이 처음 전 구간을 돌았다. 그런데 워크플로 로그로는 **감지 시각**밖에
안 보인다 — "배포 완료" 는 우리가 폴링해서 알아챈 순간이지 Dokploy 가 끝낸 순간이 아니다.
간격이 적절한지 판단할 근거가 없었다.

### 먼저 확인한 것 — 이벤트로 받을 수는 없나

Dokploy 문서의 Webhook 은 API 상 `notification.createCustom` 이다. 알림 프로바이더고,
`appDeploy` · `appBuildError` 토글에 임의 `headers` 까지 넣을 수 있다. 실제 payload 는
(`packages/server/src/utils/notifications/build-success.ts`):

```json
{
  "title": "Build Success",
  "status": "success",
  "type": "build",
  "projectName": "…",
  "applicationName": "…",
  "buildLink": "…/services/application/<applicationId>?tab=deployments"
}
```

**그래도 못 쓴다.** 셋이 막는다.

| 무엇                                 | 왜                                                                 |
| ------------------------------------ | ------------------------------------------------------------------ |
| GHA job 은 inbound HTTP 를 못 받는다 | 실행 중인 러너에 공개 엔드포인트가 없다                            |
| `deploymentId` 가 payload 에 없다    | "내가 트리거한 그 배포" 인지 구분이 안 된다 — 지금 폴링은 구분한다 |
| 알림이 organization 단위             | 앱별 필터가 없어 조직 안 모든 배포가 같은 곳으로 온다              |

`repository_dispatch` 로 직결하는 우회도 안 된다 — `headers` 는 넣어도 **body 를 Dokploy 가
고정**해서 GitHub 이 요구하는 `event_type` 을 못 넣는다. OpenAPI 604개 endpoint 전량에
`text/event-stream` · `websocket` 도 0건이다. **폴링이 맞는 선택이다.**

### 그래서 얼마나 걸리나 — done 30건

임시 프로브 워크플로로 `createdAt` · `startedAt` · `finishedAt` 을 앱당 10건씩 받았다.

| 앱      | queue | build p50 | min~max |
| ------- | ----- | --------- | ------- |
| catalog | 0초   | 21초      | 3~49    |
| cart    | 0초   | 19초      | 2~54    |
| host    | 0초   | 27초      | 25~76   |

배포 로그를 열어 보니 그 시간이 **어디로 가는지**가 분명했다. 레이어 하나다.

```
catalog  #23 DONE 15.4s   ← 앱 빌드. 나머지 #1~#29 는 전부 CACHED 이거나 0.x초
host     #23 DONE 21.8s   ← 같은 모양
```

긴 꼬리가 없다. `done` 이 찍히고 새 버전이 공표되기까지도 **0.4~0.6초**다. 그래서
감지 지연은 전부 순수 낭비다.

### 고친 것 — 15초 → 5초

| 간격        | 감지 합계 | 실작업 대비 낭비 | `deployment.all` 호출/배포 |
| ----------- | --------- | ---------------- | -------------------------- |
| **5초**     | 70.0초    | **+4.7초**       | 7.2                        |
| 10초        | 74.0초    | +8.7초           | 4.3                        |
| 15초 (이전) | 82.5초    | +17.2초          | 3.5                        |

`dokploy-deploy` 와 `mf-version-check` 둘 다 5초로 내렸다. 호출이 배포당 3.5회 → 7.2회로
늘지만 셀프호스팅 인스턴스라 문제될 양이 아니다.

### 덤으로 나온 것 — 트리거와 레코드 생성 사이 지연

```
catalog: 트리거 05:48:29 → createdAt 05:48:47.532   +18.5초
cart:    트리거 05:48:28 → createdAt 05:48:28.625   + 0.0초
```

`POST /api/application.deploy` 가 200 을 줘도 **`deployment.all` 에 레코드가 최대 18초
뒤에 나타난다.** 로그의 "새 배포가 아직 목록에 안 나타났다" 가 이것이었다. 지금 코드는
`BEFORE_ID` 와 다른 id 가 나타날 때까지 기다리므로 이미 견딘다 — 다만 **`application.deploy`
의 200 을 "배포가 시작됐다"로 읽으면 안 된다**는 뜻이다.

### 같이 줄인 것 — 버전 확인 시한 120초 → 30초

이쪽 낭비가 폴링 간격보다 컸다. **이 대기는 버전이 안 바뀌는 배포에서 전액 청구된다** —
이미지가 재사용되면 아무리 기다려도 안 바뀌므로(I-8) 매번 시한을 다 쓴다. 29차에 그렇게
2분을 버린 실측이 있다.

공표 지연이 0.4~0.6초니 30초도 50배 여유다. 게이트가 아니라 관측이라 시한을 넉넉히 잡을
이유가 애초에 없었다 — 넉넉함이 사는 쪽이 아니라 **버리는 쪽에만** 작용한다.

| 배포                   | 이전   | 이후   |
| ---------------------- | ------ | ------ |
| 이미지가 바뀐 배포     | ~0.5초 | ~0.5초 |
| 이미지가 재사용된 배포 | 120초  | 30초   |

## 2026-09-03 (31차) — 카탈로그 필터를 주소에 남긴다 (파이프라인 첫 실전 통과)

30차에서 만든 배포 파이프라인은 아직 **remote·host 를 실제로 배포해 본 적이 없었다.**
`.github/**` 만 바뀐 커밋만 지나가서 `dokploy-deploy` · `mf-version-check` ·
`mf-revalidate` 셋이 전부 skip 이었다. 그래서 실제 코드를 넣었다.

### 고친 것 — 필터가 새로고침에서 사라졌다

카테고리 선택이 `ProductGrid`(remote) 안의 `useState` 였다. 새로고침하면 `all` 로
돌아가고 그 화면을 링크로 건넬 수도 없었다.

**remote 는 URL 을 모른다**(ADR-013). 그래서 remote 는 "바뀌었다"만 알리고, 그걸 주소에
남길지는 host 가 정한다 — `onSelect` 와 똑같은 규칙이다.

| 쪽     | 무엇                                                                                    |
| ------ | --------------------------------------------------------------------------------------- |
| remote | `ProductGridProps.onCategoryChange?` 추가. `category` prop 이 바뀌면 내부 선택도 맞춘다 |
| host   | `CatalogSlot` 신설 — `?category=` 를 읽고 `router.replace` 로 쓴다                      |

prop 동기화는 `useEffect` 가 아니라 렌더 중에 한다(React `useState` 문서의
"Adjusting state when a prop changes"). effect 로 하면 옛 값으로 한 번 그린 뒤 다시 그린다.
필요한 이유는 **뒤로 가기** — 그때는 URL 만 되돌아오므로 안 맞추면 주소와 화면이 갈라진다.

### 밟은 것 — 건드리지도 않은 라우트가 죽었다

처음엔 `useSearchParams` 를 `CatalogSection` 에 넣었다. typecheck 통과, 테스트 655개 통과,
그리고 `pnpm build` 가 **`/lab/cache`** 에서 죽었다.

```
Error occurred prerendering page "/lab/cache"   digest: 'CLIENT_HOOK_DYNAMIC'
```

`CatalogSection` 을 홈만 쓰는 게 아니었다. `LabPanel` 을 거쳐 `/lab/*` 셋이 같이 쓰고
그쪽은 프리렌더 대상이다. **요청 컨텍스트를 읽는 훅 하나가 소비처 전부의 렌더 방식을
바꾼다.** `<Suspense>` 로 감싸는 건 답이 아니었다 — lab 패널은 서버 렌더 시각을 비교하는
것이 목적이라 클라이언트 렌더로 내려가면 실험이 무의미해진다.

경계를 옮겨서 고쳤다. 저장소에 이미 같은 꼴이 있었다 — `CartSlot`(쿠키를 읽는다) ↔
`CartSection`(받아서 그린다). ADR-020 으로 굳히고 I-9 로 남겼다.

```
CatalogSlot     useSearchParams · router.replace      홈만 쓴다
CatalogSection  category · onCategoryChange 를 받는다  홈 · /lab/* 넷이 쓴다
```

**이 실수는 typecheck 도 test 도 안 잡는다. `pnpm build` 만 잡았다.**

### DTS 가 실제로 한 일

`pnpm mf:types` 한 번으로 host 가 새 prop 을 알게 됐다. 그 전에는 정확히 한 줄이 죽었다.

```
CatalogSection.tsx(51,9): error TS2353:
  'onCategoryChange' does not exist in type 'ProductGridProps'
```

옵셔널 prop 이라 **옛 remote 에서도 안 터진다** — 무시될 뿐이다. 29차가 지적한
"에러가 안 나서 더 위험한" 바로 그 경우고, 배포 순서가 그 창을 닫는다.

### 테스트

| 어디            | 무엇                                                                                    |
| --------------- | --------------------------------------------------------------------------------------- |
| catalog exposes | 필터 변경 통지 / **콜백 없이도 자기 화면은 바뀐다** / prop 되돌림                       |
| host            | `CatalogSlot` — 모르는 값은 `all` / `replace` / `all` 은 주소에서 뺀다 / 다른 쿼리 보존 |

"콜백 없이도" 는 배포가 한 주기 어긋난 host 를 흉내 낸 것이다.

## 2026-09-03 (30차) — 배포 워크플로를 순서와 스크립트로 가른다

29차에서 `deploy.yml` 이 280줄이 됐다. 순서(`needs` · `if`)와 각 단계의 bash 가 한 파일에
섞여 있어서, 파이프라인 모양을 보려면 스크립트를 넘겨 읽어야 했다.

### 폴백 도메인을 지웠다

```yaml
# 전
HOST_URL: ${{ vars.MF_HOST_URL || 'https://mfa.lakegreen.net' }}
# 후
HOST_URL: ${{ vars.MF_HOST_URL }}
```

폴백은 편하지만 **포크나 다른 인스턴스에서 남의 도메인을 조용히 때린다.** 안 붙어야 할 때
안 붙는 편이 낫다. 대신 `MF_HOST_URL` · `MF_CATALOG_URL` · `MF_CART_URL` · `DOKPLOY_URL`
네 개가 저장소 Variables 에 **필수**가 됐다(`docs/03-setup/04-dokploy.md`).

빈 값일 때 어디서 죽는지는 균일하지 않다 — `DOKPLOY_URL` 이 비면 `curl` 이 상대 URL 로
즉시 실패해 job 이 죽지만, remote URL 이 비면 baseline 이 `|| echo ''` 로 삼켜 조용히
지나간다. 시끄럽게 죽는 쪽만 믿을 수 있다는 뜻이다.

### composite action 3개를 더 뺐다

| action                  | 무엇                               | 왜 뺐나                              |
| ----------------------- | ---------------------------------- | ------------------------------------ |
| `detect-targets`        | 바뀐 경로 → 배포 대상 판별         | 가장 긴 bash. 함정 주석이 3개 붙는다 |
| `dokploy-deploy` (29차) | 배포 트리거 + 완료 대기            | remote·host 가 **같은 판정**을 해야  |
| `mf-version-check`      | 새 버전 공표 관측 (게이트 아님)    | "실패시키지 않는다" 이유가 길다      |
| `mf-revalidate`         | host 캐시 무효화 웹훅 (재시도 5회) | 재시도 안전성 근거가 길다            |

`deploy.yml` 280 → 170줄. 남은 건 트리거 · 동시성 · env · job 사이 순서뿐이라, 파일 하나로
파이프라인 모양이 보인다.

**로컬 action 은 `uses: ./…` 이라 그 job 이 먼저 `actions/checkout` 을 해야 한다.**
`revalidate` job 은 지금까지 체크아웃이 없었어서 이번에 추가했다.

`dokploy-deploy` 를 다른 action 안에 중첩하는 안은 안 썼다 — `remotes` job 을 한 줄로
줄일 수 있지만, `vars`/`secrets` 를 한 겹 더 내려보내야 하고 로컬 action 의 `./` 해석이
중첩에서 어떻게 도는지가 또 하나의 추측이 된다.

### 문서에 남은 죽은 링크

`.github/workflows/mf-revalidate.yml` 을 가리키는 곳이 둘 있었다(`01-decision.md`,
`04-dokploy.md`). 29차에 `deploy.yml` 의 `revalidate` job 으로 흡수되며 사라진 파일이다.
**워크플로를 합칠 때 문서 링크는 같이 안 따라온다** — grep 으로만 잡힌다.

## 2026-09-03 (29차) — 배포 순서를 CI 가 쥔다 (`ci/deploy-pipeline`)

28차에서 "host 가 remote 보다 먼저 뜨면 어떻게 되나" 를 짚다가, 그게 실재하는 창이라는
결론이 나왔다. 이번 회차는 그 창을 인프라로 닫은 기록이다.

### 문제 — 타입이 못 잡는 스큐

host 는 **커밋된 MF DTS** 로 컴파일되지만 런타임에는 **배포된** remote 를 받는다
(`mf-version.json` 이 공표한 버전으로 핀한다). 같은 커밋에 host·remote 를 다 고쳐도
배포는 앱별로 독립이라, host 가 먼저 뜨면 **새 host 코드 + 옛 remote 번들** 이 된다.
양쪽이 같은 커밋의 타입으로 컴파일되므로 **컴파일러는 이 상태를 볼 수 없다.**

| props 를 어떻게 바꿨나                 | 옛 remote 컴포넌트에서                          |
| -------------------------------------- | ----------------------------------------------- |
| 옵셔널 prop 추가                       | 모르는 prop 이라 무시 — **에러 없이 옛 동작**   |
| 필수 prop 추가 · 이름 변경 · 타입 변경 | `undefined` 를 받는다 → 오동작 또는 `TypeError` |

터지면 `RemoteBoundary` 가 잡아 그 패널만 에러 상자가 되고 페이지는 200 으로 산다.
**에러가 나는 쪽이 오히려 낫다** — 옵셔널 추가는 아무도 모르게 지나간다.

> **DTS 이전으로 되돌리면 해결되나 — 아니다.** main 구조(props 를 계약 패키지가 소유)
> 에서도 배포된 remote 번들은 옛 props 로 컴파일된 JS 다. 런타임 결과가 한 글자도 다르지
> 않다. 스큐의 원인은 타입 소유권이 아니라 **런타임 MF + 독립 배포**이고, 그건 이
> 저장소의 전제 자체다.

### 고친 방법 — 순서를 CI 가 만든다

Dokploy 에는 **앱 사이의 순서 개념이 없다.** Watch Paths 로 앱마다 따로 뜰 뿐이라
한 push 가 세 앱을 동시에 물면 누가 먼저 끝날지 모른다. 공식 문서도 순서가 필요하면
CI 에서 API 로 트리거하라고 안내한다(`POST /api/application.deploy`).

```
detect ─┬─ remotes (matrix)  트리거 → 배포 완료까지 대기
        │                     ↓ 실패하면 여기서 멈춘다 (host 안 뜸)
        ├─ host              remote 가 끝난 뒤에 트리거
        └─ revalidate        host 를 새로 안 띄웠을 때만
```

전제로 **세 앱의 Autodeploy 를 껐다.** 안 끄면 push 로도 뜨고 API 로도 떠서 이중 배포가
되고 순서 보장이 사라진다.

### 밟은 것 — 완료 신호를 캐시가 지웠다

처음엔 완료를 `mf-version.json` 변화로 판정했다. `mf-revalidate` 시절 로직을 그대로
가져온 것이다. 그런데 첫 실행에서 20분 타임아웃으로 죽을 뻔했다.

```
catalog  Done   createdAt 04:43:03 → finishedAt 04:43:07   (4초)
mf-version.json: tmtkylrrx  (이전 배포 그대로)
```

그 커밋이 건드린 게 `.github/**` 와 `docs/**` 뿐인데 **둘 다 `.dockerignore` 로 제외된다.**
컨텍스트가 바이트 단위로 같으니 Docker 가 전 레이어를 재사용했고, 버전을 정하는
`mf-build-version.ts` 의 `RUN` 도 재사용되어 버전이 그대로였다. **Dokploy 는 정직했다** —
틀린 건 "버전이 바뀌면 배포가 끝난 것" 이라는 우리 가정이다(known-issues I-8).

그 가정이 오래 멀쩡했던 이유: 옛 워크플로는 **remote 코드가 바뀐 push 에서만** 돌았다.
파이프라인으로 승격시키며 "수동 재배포" · "공유 파일만 바뀐 배포" 가 새로 생겼다.

완료 판정을 **배포 상태**로 바꿨다.

```
GET /api/deployment.all?applicationId=<id>
→ 최신이 앞인 배열. 트리거 전 .[0].deploymentId 를 기억해 두고
  새 id 의 status 가 done | error 가 될 때까지 폴링
```

응답 형태는 임시 프로브 워크플로로 실측했다 — 공식 문서에는 `{}` 라고만 적혀 있어
(자동 생성 흔적) 그대로는 못 쓴다. remote 와 host 가 같은 판정을 해야 해서
`.github/actions/dokploy-deploy` composite action 한 벌로 뺐고, 그 덕에 **미구현이던
host 완료 판정도 같이 해결됐다.**

### 실측 — 두 경우가 다르다

버전 확인은 게이트가 아니라 참고 단계로 남겼다(최대 120초). 두 종류의 배포에서 값이 갈린다.

| 배포                          | 이미지      | 버전 확인 소요       |
| ----------------------------- | ----------- | -------------------- |
| `.github`·`docs` 만 바뀐 커밋 | 재사용      | **120초** (타임아웃) |
| `scripts/` 가 바뀐 커밋       | 실제 재빌드 | **0.6초**            |

```
cart  배포 완료 05:05:41.72 → 새 버전 공표됨 05:05:42.30  (tmtl2a4y0)
```

실전에서는 첫 폴링에 끝난다. "느리면 임계값을 만들자" 는 안은 기각했다 — 느린 경우가
이미지가 안 바뀐 배포뿐이고, 임계값은 또 하나의 추측이 된다.

### 전 구간 통과

```
✓ 배포 대상 판별   6s    remotes=["catalog","cart"] host=true
✓ catalog 배포     39s
✓ cart 배포        54s
✓ host 배포        38s   ← remote 둘이 끝난 뒤에 시작
- 캐시 무효화      0s    ← 스킵 (host 를 새로 띄웠으니 불필요)
```

### 기각 — 이벤트 기반 완료 통지

Dokploy 에 범용 Webhook 알림이 있고 `appDeploy` · `appBuildError` 이벤트를 보낸다.
폴링을 걷어낼 수 있나 보고 기각했다.

- **GitHub 을 직접 못 부른다.** 워크플로를 외부에서 깨우려면 `repository_dispatch` 인데
  `Authorization` 헤더가 필요하고, 웹훅 설정에는 이름과 URL 뿐이다(커스텀 헤더 없음).
- **페이로드에 상관 정보가 없다.** 문서 예시가 `{title, message, timestamp}` 다.
  "지금 끝난 게 어느 앱인가, 내가 트리거한 그 배포인가" 를 판별할 수 없다.
  알림 채널은 조직 전역이지 배포 실행별로 붙지 않는다.
- 수신기를 하나 두면 첫 제약은 풀리지만, 둘째 때문에 결국 `deployment.all` 을 조회하게
  된다 — **폴링이 한 겹 안으로 숨을 뿐이다.**

쓸모 있는 자리는 따로 있다: `appBuildError` 알림 채널(CI 밖 배포 실패를 알 수 있다).

### 남은 규칙 하나

순서를 못 박았으므로 지켜야 할 것이 하나로 준다 —
**remote 는 한 배포 주기만큼 하위호환을 유지한다.** 그걸 못 지키는 변경(필수 prop 추가
등)만 expand/contract 로 두 번에 나눈다: ① remote 가 옵셔널로 받게 배포 → ② host 가 쓰기
시작 → ③ remote 에서 옛 것 제거.

## 2026-09-03 (28차) — 배포에서만 터진 회귀, 그리고 파이프라인을 한 바퀴 돌렸다

27차를 main 에 머지하고 push 했다. CI 는 `build` · `test` · `verify` 셋 다 초록이었고
새로 넣은 "MF DTS 가 최신인지 확인" 단계도 통과했다 — **빌드된 dist 를 서빙해 받은 타입이
dev 로 받은 것과 바이트 단위로 같다**는 확인이다(그전까지는 dev 경로만 실측했었다).

그런데 **Dokploy 배포는 세 앱 모두 실패했다.**

```
@mfa/contracts:build: src/contract-check.ts(6,45): error TS2307:
  Cannot find module './generated/@mf-types/cart/apis'
```

`.dockerignore` 의 `**/@mf-types` 가 커밋된 생성물을 빌드 컨텍스트에서 빼고 있었다.
그 줄은 컨테이너화 시점에 들어왔고 그때는 맞는 규칙이었다 — 생성물이 host 앱 안에 있어
이미지가 읽을 일이 없었다. DTS 소유를 계약 패키지로 옮기면서 전제가 깨졌다.
전문과 "왜 여기까지 와서야 드러났나" 는 known-issues **I-7**.

배운 것 한 줄: **생성물을 커밋하기로 했으면 그것을 읽는 모든 경로에서 빠지지 않는지 본다.**
`.gitignore` · `.prettierignore` 는 같이 고쳤는데 `.dockerignore` 만 남았고,
그 파일은 로컬 빌드도 CI 도 읽지 않아 배포까지 가야 드러났다.

Dokploy 의 Watch Paths 에도 `.dockerignore` 를 세 앱 모두 추가했다. 그게 없으면
이 파일만 고친 커밋은 재배포를 트리거하지 못한다(실측 — push 했는데 아무 일도 안 일어났다).

### 파이프라인 검증 — 모듈 하나를 실제로 추가해봤다

"remote 에 파일을 놓고 `pnpm mf:types` 만 돌리면 host 까지 계약이 흐르는가" 를
`catalog/RelatedProducts`(상세 페이지 아래 관련 상품) 로 한 바퀴 돌렸다.

**1. 손으로 만진 파일은 remote 하나다.**

```
apps/remote-catalog/src/exposes/RelatedProducts.tsx   # props 도 이 파일 안에
```

**2. 그 상태에서 host 가 그 모듈을 쓰면 컴파일이 막는다.**

```
src/components/RelatedProductsSection.tsx(24,7): error TS2322:
  Type '"catalog/RelatedProducts"' is not assignable to type
  '"cart/CartBadge" | "cart/CartPanel" | "cart/CheckoutFlow" |
   "catalog/ProductDetail" | "catalog/ProductGrid"'
```

**3. `pnpm mf:types` 한 번.**

```
[ Module Federation DTS ] Federated types extraction completed
[gen-module-ids] 6개 → packages/contracts/src/generated/module-ids.ts
```

생성물 넷이 움직였다 — `@mf-types/catalog/RelatedProducts.d.ts`(신규),
`compiled-types/src/exposes/RelatedProducts.d.ts`(신규, 실제 시그니처),
`apis.d.ts`(`RemoteKeys` 확장), `module-ids.ts`(5 → 6). **등록한 자리는 없다.**

props 가 인라인되어 넘어온 것도 확인했다 — 주석까지 같이 온다.

```ts
// generated/@mf-types/catalog/compiled-types/src/exposes/RelatedProducts.d.ts
export interface RelatedProductsProps {
  productId: string;
  limit?: number;
  onSelect?: (product: Product) => void;
}
```

### 안전망 둘이 그 자리에서 걸렸다

`pnpm test` 가 **2개 실패**로 돌아왔다. 둘 다 27차에 만든 그물이다.

| 실패                                       | 무엇을 잡았나                                       |
| ------------------------------------------ | --------------------------------------------------- |
| `remote-catalog/src/server-entry.test.tsx` | SSR 진입점 맵에 새 모듈을 **안 넣었다** (진짜 누락) |
| `contracts/src/remote-contract.test.ts`    | `exposedNames` 기대값이 이름 목록 스냅샷이었다      |

첫 번째가 이 그물을 만든 이유 그대로다. 웹 `exposes` 는 디렉터리 스캔이라 저절로 늘지만
SSR 맵은 손으로 적는 유일한 자리라, 빠뜨리면 **브라우저에서는 되고 서버 렌더에서만
"expose 없음"** 이 된다. 만든 지 하루 만에 첫 실사용에서 걸렸다.

두 번째는 예상 못 한 수확이다. 그 테스트가 `['ProductDetail', 'ProductGrid']` 를 적고
있었는데, 그건 **"등록하는 자리" 가 테스트로 위장해 남아 있던 것**이다. 모듈을 추가할
때마다 고쳐야 하니 이 구조가 없앤 그 비용이 그대로다. 스냅샷을 지우고 성질만 보게 고쳤다 —
개수는 `MODULE_IDS` 에서 파생하고, "접두사가 떨어졌다" 는 남은 이름에 `/` 가 없는 것으로 본다.

### 결과

`pnpm lint` · `typecheck` · **647 테스트** · `pnpm build` 6/6 전부 통과.
host 프리렌더가 remote SSR 번들을 실제로 실행하므로, 빌드 통과는 새 모듈이 SSR 경로까지
살아 있다는 뜻이다.

## 2026-09-02 (27차) — MF DTS 를 켜고, 계약의 방향을 뒤집었다 (`feat/mf-dts`)

3차에 껐고 [24차 검토](01-research/03-dts-plugin-review.md)에서 "도입 보류" 로 판정했던
`dts` 를 켰다. 켜는 것 자체는 절반이었다 — **진짜 작업은 계약의 소유권을 옮긴 것**이다.

### 1단계: 켜기만 했더니 아무것도 안 잡혔다

remote 둘의 `dts.generateTypes` 를 켜고, host 가 `mf dts --fetch` 로 받아 `@mfa/contracts`
와 대조하게 만들었다. 파이프라인은 전부 동작했다(dev · 빌드 산출물 양쪽).
그런데 계약에 필수 prop 을 넣고 대조해도 **통과했다.**

받아온 타입을 열어보면 이유가 바로 나온다.

```ts
// @mf-types/catalog/compiled-types/src/exposes/ProductGrid.d.ts
import { type ProductGridProps } from '@mfa/contracts'; // ← 계약을 다시 가리킨다
```

remote 가 props 를 `@mfa/contracts` 에서 가져다 썼으므로, host 가 받은 타입도 결국
같은 선언이었다. 대조는 `A extends A` 를 확인하는 셈이었다.

`extractThirdParty: true` 로 계약을 인라인시키려 했지만 그것도 안 됐다 —
`third-party-dts-extractor` 가 `require.resolve` 를 쓰는데 `@mfa/contracts` 는 `require`
조건이 없는 ESM 전용 워크스페이스 패키지다(known-issues I-3).

### 2단계: props 의 소유권을 remote 로 옮겼다

문제는 도구가 아니라 **배치**였다. host 와 remote 가 같은 선언을 가리키는 한 DTS 가
전달할 정보는 0 이다. 그래서 방향을 뒤집었다.

| 무엇                       | 전                  | 후                                         |
| -------------------------- | ------------------- | ------------------------------------------ |
| props 선언                 | `@mfa/contracts`    | **remote 의 expose 파일 옆**               |
| `RemoteModuleMap`          | `@mfa/contracts`    | **host** — DTS 가 받아온 타입으로 조립     |
| 모듈 id 목록(`MODULE_IDS`) | `MODULES` 에서 파생 | `@mfa/contracts` — 손으로 적은 문자열 배열 |
| 도메인 어휘(`Product` 등)  | `@mfa/contracts`    | 그대로                                     |

`@mfa/contracts` 에 남은 것은 **런타임 이름 목록**과 **공통 어휘**뿐이다. 타입은 DTS 가
주지만 DTS 는 타입뿐이라 "노출 모듈이 몇 개인가" 는 코드가 물어볼 수 없다 — 그게
`MODULE_IDS` 가 남은 이유다.

### 실측 — 이제 진짜로 잡힌다

`ProductDetail` 의 props 에 필수 `variant` 를 추가하고 `pnpm mf:types` → `pnpm typecheck`.

```
src/components/ProductDetailSection.tsx(10,7):
  error TS2741: Property 'variant' is missing in type '{ productId: string; }'
                but required in type 'ProductDetailProps'.
```

**타입 별칭 대조가 아니라 host 의 실제 호출부가 깨졌다.** 1단계 구조에서는 이게 절대
안 잡혔다. remote 가 계약을 바꾸면 host 가 컴파일 단계에서 안다 — DTS 를 켜는 이유가
이거였다.

### 대가 — `@mf-types` 를 커밋한다

host 소스가 생성물에 의존하게 됐다. 그대로 두면 `pnpm typecheck` 가 remote 기동을
요구하고, 그건 이 저장소가 DTS 를 오래 껐던 바로 그 이유다.

그래서 `apps/host/@mf-types/` 를 **저장소에 넣는다.** typecheck 는 네트워크 0회를 유지한다.
낡을 위험은 CI 가 잡는다 — `pnpm build` 뒤에 정적 서버를 띄워 `pnpm mf:types` 를 돌리고
`git diff --exit-code` 로 본다. prettier 는 이 디렉터리를 건드리지 않는다(`.prettierignore`) —
포맷하면 생성 원본과 매번 달라져 그 검사가 항상 실패한다.

### 3단계: 손으로 적는 표를 없앴다

2단계까지는 host 에 이런 표가 있었다.

```ts
type RemoteModuleMap = {
  'catalog/ProductGrid': { default: typeof ProductGrid };
  … // 모듈마다 import 한 줄 + 표 한 줄
};
```

**그건 `@mfa/contracts` 에 있던 맵을 host 로 옮겨 적은 것에 지나지 않았다.** 모듈을
추가할 때 손이 가는 자리가 오히려 하나 늘었다 — 개선이 아니라 이동이었다.

DTS 는 이미 `@module-federation/runtime` 을 모듈 확장하며 `loadRemote()` 의 시그니처를
좁혀놓는다. `PackageType` 자체는 `export` 되지 않지만 **함수의 반환 타입에서 되꺼낼 수
있다**(실측).

```ts
export type RemoteModule<K extends RemoteModuleId> = Awaited<
  ReturnType<typeof loadRemote<K, never>>
>;
```

표가 사라졌다. 드리프트 검출은 그대로다 — remote 에 필수 prop 을 추가하고 확인했다.

### 4단계: 계약 지식을 `@mfa/contracts` 한 파일로 모았다

3단계까지도 계약 지식이 두 패키지에 걸쳐 있었다 — 이름 목록은 `@mfa/contracts`,
타입은 host 의 `loader/modules.ts`. `@mf-types` 도 host 가 들고 있었다.

DTS 생성물을 `packages/contracts/` 로 옮기고 계약 지식을 전부 `remote-contract.ts` 로 합쳤다.
그러면서 방향도 하나 더 뒤집었다 — **`RemoteModuleId` 의 원본이 `RemoteKeys` 가 됐다.**

```ts
export type RemoteModuleId = CatalogKeys | CartKeys;     // remote 가 공표한 것
export const MODULE_IDS = [ … ] as const satisfies readonly RemoteModuleId[];
export type ModuleIdsAreExhaustive = Expect<Equal<(typeof MODULE_IDS)[number], RemoteModuleId>>;
```

손으로 적는 `MODULE_IDS` 는 이제 **타입을 따라가는 런타임 반영**이다(`satisfies` 만으로는
누락을 못 잡아 전수 대조를 따로 건다). `apps/host/src/mf/loader/modules.ts` 는 사라졌다.

#### 진입점을 갈라야 했다

`remote-contract.ts` 가 `../@mf-types` 를 읽는데, 그건 remote 를 빌드해야 생긴다.
그런데 remote 의 `src/exposes` 는 배럴에서 `Product` · `CartLine` 을 가져다 쓴다.
배럴이 이 파일까지 재-export 하면 **remote 빌드가 자기 산출물을 요구하는 순환**이 된다.

그래서 `@mfa/contracts`(어휘)와 `@mfa/contracts/remote`(모듈 계약)를 갈랐다.
remote 는 앞의 것만 쓴다. 각 remote 의 `exposes/contract.test.ts` 도 그래서 없앴다 —
그 테스트가 `exposedNames` 를 쓰느라 뒤의 진입점을 끌어왔고, 검증 내용은
`ModuleIdsAreExhaustive`(실제 빌드 산출물과 대조라 더 강하다)와 `readExposes` 단위
테스트로 나눠 옮겼다.

#### 조용히 무너지는 함정을 하나 밟았다

옮긴 직후 host `typecheck` 는 통과하는데 **드리프트가 안 잡혔다.** `RemoteModule<K>` 가
`any` 로 무너져 있었다 — `loadRemote()` 를 좁히는 모듈 확장(`@mf-types/index.d.ts`)이
host 프로그램에 없었기 때문이다. 그 파일은 아무도 import 하지 않아 저절로 안 들어오고,
`RemoteModule<K>` 는 `.d.ts` 에 계산 전 형태로 emit 되어 **소비처에서 다시 계산된다.**

읽는 프로그램마다 `include` 에 넣어야 한다. 자세한 것과 5초짜리 확인법은 known-issues I-5.

### 5단계: 런타임 목록도 생성물로 바꿨다

4단계까지 손으로 적는 자리가 딱 하나 남아 있었다.

```ts
export const MODULE_IDS = [
  'catalog/ProductGrid',
  …
] as const satisfies readonly RemoteModuleId[];
```

타입에서 값은 못 뽑는다. 하지만 **DTS 산출물이 이미 그 목록을 파일로 갖고 있다.**

```ts
// @mf-types/catalog/apis.d.ts
export type RemoteKeys = 'catalog/ProductDetail' | 'catalog/ProductGrid';
```

`scripts/gen-module-ids.ts` 가 그 리터럴을 뽑아 `generated/module-ids.ts` 로 쓴다.
`pnpm mf:types` 가 페치 다음에 그걸 이어서 돌린다.

파싱은 dts-plugin 의 출력 포맷에 기대므로 **믿지 않는다.** 결과가 틀리면
`ModuleIdsAreExhaustive` 가 컴파일 타임에 잡는다 — 생성된 배열과 (타입으로 읽은)
`RemoteModuleId` 를 전수 대조하기 때문이다. 항목을 빼고, 없는 키를 넣어 양쪽 다
실패하는 것을 확인했다. 즉 **스크립트는 편의고 정확성은 타입 시스템이 보증한다.**

#### 실증 — 손으로 고친 파일 0개

`apps/remote-catalog/src/exposes/StockTicker.tsx` 를 새로 놓고 remote 빌드 →
`pnpm mf:types` → `pnpm typecheck` 만 돌렸다. 목록이 5개에서 6개로 늘고 전부 통과했다.
**계약 파일에도 host 에도 손대지 않았다.**

"그 디렉터리에 있는 것만 노출한다" 는 규칙이 이제 타입과 값을 관통한다 —
`src/exposes/` → `exposes` 설정(`readExposes`) → DTS `RemoteKeys` → `MODULE_IDS`.

#### 생성물은 `src/generated/` 한 폴더에 모은다

`@mf-types/`(DTS 산출물)와 `module-ids.ts`(거기서 뽑은 목록)는 둘 다 `pnpm mf:types` 가
만든다. 손으로 고치면 안 되는 파일이 소스 사이에 섞여 있으면 그 사실이 안 보인다.

옮기고 나서 **계약이 통째로 사라졌다.** contracts 빌드도 host `typecheck` 도 초록인데
`RemoteModuleId` 가 `any` 였다.

```ts
const bogus: RemoteModuleId = 'catalog/DoesNotExist'; // ← 통과했다
```

`remote-contract.ts` 의 `import … from './generated/@mf-types/catalog/apis'` 가 emit 된
`dist/remote-contract.d.ts` 에 그대로 남는데, tsc 는 입력 `.d.ts` 를 `dist` 로 복사하지
않는다. 소비처가 그 경로를 못 찾고 **`skipLibCheck` 가 에러를 삼킨다.** (known-issues I-6)

복사 스크립트로 풀 수도 있었고 실제로 그렇게 만들어 동작시켜봤다. 하지만 참조가 남아
있는 한 같은 함정이 계속 있다 — `exports` 나 `rootDir` 을 누가 건드리면 또 조용히
무너진다. 그래서 **참조 자체를 없앴다.**

- 생성 스크립트가 값과 **타입을 같이** 만든다
  (`export type RemoteModuleId = (typeof MODULE_IDS)[number]`) → 소스가 `@mf-types` 를
  안 본다
- `@mf-types` 와의 대조는 **아무것도 export 하지 않는** `src/contract-check.ts` 가 맡는다.
  export 가 없으면 그 `.d.ts` 는 `export {}` 뿐이라 참조가 안 남는다

결과적으로 `rootDir` · `exports` 를 건드릴 일도 없어졌고, 복사 스크립트도 필요 없다.
`src/**` 가 `src/generated/@mf-types/**` 를 이미 잡으므로 모듈 확장도 저절로 들어온다.

### 6단계: 로컬에서 잡히던 것을 되찾고, 남은 구멍 둘을 막았다

5단계까지 오면서 **"등록을 잊는다"가 "명령을 잊는다"로 바뀌었다.** 그런데 그 둘은 잡히는
자리가 다르다.

| 잊는 것              | 전(main)                | 5단계 직후         |
| -------------------- | ----------------------- | ------------------ |
| `MODULES` 등록       | `pnpm test` — 로컬 · 초 | (그 자리가 없어짐) |
| `pnpm mf:types` 실행 | —                       | **CI 만**          |

`pnpm typecheck` 로는 안 잡힌다. `contract-check.ts` 가 생성된 `MODULE_IDS` 와 생성된
`RemoteKeys` 를 대조하는데 갱신을 안 하면 **둘 다 똑같이 낡아서 일치**한다. push 하고
CI 가 remote 를 빌드해 `pnpm mf:types` 를 돌린 뒤 `git diff` 로 잡을 때까지 모른다.

그래서 `scripts/gen-module-ids.test.ts` 를 뒀다. 커밋된 `MODULE_IDS` 를 지금
`src/exposes/` 스캔 결과와 대고 본다 — 네트워크도 remote 기동도 빌드도 없이 디렉터리와
커밋된 파일만 읽는다. 실증: `Drift.tsx` 를 넣자 즉시 실패했다.

```
AssertionError: expected [ 'cart/CartBadge', …(4) ] to deeply equal [ 'cart/CartBadge', …(5) ]
-   "catalog/Drift",
```

**`scripts/` 에 둔 이유**는 순환이다. 이 대조를 remote 안에 두면 `@mfa/contracts` 를
import 하게 되고, 그 패키지가 MF DTS 를 읽는 지금은 remote 가 자기 산출물을 요구하게
된다 — 각 remote 의 `exposes/contract.test.ts` 를 없앤 바로 그 이유다. `scripts/` 는
어느 remote 의 빌드 그래프에도 없다.

#### 스캔 인자를 `EXPOSE_SCAN` 으로 합쳤다

그 테스트가 생기면서 `readExposes('./src/exposes', { ignore: [/\.test\.tsx$/] })` 를 적는
자리가 셋이 됐다(Vite 설정 · Rsbuild 설정 · 테스트). 갈리면 **검사가 실제 빌드와 다른
것을 보게 되는** 상태가 성립한다. "무엇이 expose 인가는 번들러가 달라도 갈리면 안 된다"가
이미 규칙이라, 그 판단을 `@mfa/remote-config/node` 의 `EXPOSE_SCAN` 한 곳에 뒀다.

#### 구멍 1 — SSR 진입점 맵은 아무도 안 봤다

웹 `exposes` 는 스캔인데 `server-entry.ts` 의 맵은 손으로 적는다(정적 import 여야 번들이
갈리지 않는다). 빠뜨리면 **브라우저에서는 되는데 서버 렌더에서만 "expose 없음"** 이 된다.
`pnpm build` 의 host 프리렌더가 결국 잡지만 remote 를 다 빌드한 뒤다.

각 remote 에 `src/server-entry.test.tsx` 를 뒀다 — 맵의 키 ≡ 스캔 결과. 파일 하나 여는
값으로 잡힌다.

> 토폴로지 문서의 "같은 키가 네 곳에서 맞아야 한다" 표는 이 자리를
> `exposes/contract.test.ts` 가 본다고 적고 있었는데, 그 테스트는 실제로 스캔 ≡
> `MODULE_IDS` 만 봤다. **서버 맵은 처음부터 검사 밖이었다.**

#### 구멍 2 — "remote 는 배럴만" 이 문서에만 있었다

remote 가 `@mfa/contracts/remote` 를 import 하면 빌드 순환이 된다. 어기면 결국 죽지만
에러가 모듈 해석 실패로만 보여 원인을 안 가리킨다. 두 remote 의 `eslint.config.js` 에
`no-restricted-imports` 로 이름을 대고 막았다 — 규칙이 문서가 아니라 코드가 됐다.

```
1:1  error  '@mfa/contracts/remote' import is restricted from being used.
            remote 는 @mfa/contracts 배럴만 쓴다. /remote 는 MF DTS 산출물을 읽어서 빌드 순환이 된다
```

### 결산 — 모듈 하나를 추가하는 비용

| 단계               | 전(main)                       | 후                            |
| ------------------ | ------------------------------ | ----------------------------- |
| remote expose 파일 | 새 파일                        | 새 파일 (props 도 그 안에)    |
| props 선언         | `@mfa/contracts` 에 인터페이스 | (위와 같은 파일)              |
| 등록               | `MODULES` 한 줄                | **없음**                      |
| host               | —                              | —                             |
| 명령               | —                              | `pnpm mf:types` + 생성물 커밋 |

**손으로 만지는 파일이 1개다** — 전보다 하나 줄었다. 대신 명령 하나와 커밋되는
생성물 둘(`generated/@mf-types/`, `generated/module-ids.ts`)이 붙는다.

remote 를 **새로** 추가할 때는 세 줄이 는다 — `remote-contract.ts` 의 `RemoteKeys`
import, 그리고 contracts · host 양쪽 tsconfig 의 `paths` 매핑(`.d.ts` 안의 bare
specifier 는 읽는 쪽 설정으로 해석되므로 양쪽 다 필요하다). 와일드카드(`"*"`)로 `paths`
를 쓰면 평범한 import 까지 가로챈다(known-issues I-4).

늘어난 것:

```
pnpm mf:types                                   # 타입 + 목록 갱신 (remote 기동 전제)
packages/contracts/module-federation.config.ts  # mf dts CLI 전용 설정
packages/contracts/src/generated/               # 커밋되는 생성물 (@mf-types · module-ids)
scripts/gen-module-ids.ts                       # DTS → 런타임 목록
@mfa/contracts/remote                           # 모듈 계약 전용 진입점
.github/workflows/ci.yml                        # 그 생성물들이 낡았는지 보는 단계
```

줄어든 것: `@mfa/contracts` 의 props 인터페이스 5개, `props<P>()` 헬퍼, `MODULES` 객체,
`RemoteModuleMap`, 손으로 적던 `MODULE_IDS`, host 의 `loader/modules.ts`,
각 remote 의 `exposes/contract.test.ts` 둘. 1단계에서 만들었던 `mf-types-check/` 와
`tsconfig.mf-types.json` 도 없앴다.

### 이 값어치가 있나 — 정직하게

**모노레포에서는 얻는 것이 크지 않다.** 전에도 드리프트는 잡혔다 — props 가 계약
패키지에 있었으므로 remote 가 그걸 안 지키면 **remote 자신의 typecheck** 가 죽었다.
바뀐 건 실패 지점이다.

|                         | 계약 강제(전)         | DTS 전파(후)             |
| ----------------------- | --------------------- | ------------------------ |
| remote 가 계약을 어기면 | remote 빌드가 죽는다  | — (어길 대상이 없다)     |
| remote 가 표면을 바꾸면 | 아무 일도 안 일어난다 | **host 호출부가 죽는다** |

전자는 "합의한 모양을 지켜라", 후자는 "네가 바꾸면 쓰는 쪽이 안다" 다. 같은 저장소에서
같은 사람이 양쪽을 고친다면 전자가 더 단순하고 실패도 빨리 난다.

DTS 가 값어치를 하는 건 **remote 가 다른 저장소·다른 팀**일 때다. 그때는 계약 패키지를
공유할 수 없으니 DTS 가 유일한 전달 수단이 된다. 24차 검토가 재검토 조건으로 적었던
바로 그 상황이고, **이 저장소는 아직 그 조건이 아니다.**

그래서 이 브랜치는 "그 조건이 왔을 때 무엇을 해야 하는지" 를 실물로 남긴 것에 가깝다.
`main` 에 병합할지는 그 판단에 달렸다.

### 남은 한계

**SSR 경로는 여전히 DTS 밖이다.** `loader/server.ts` 는 우리가 만든 로더라 MF 가 존재를
모른다. 다만 호출부가 `loadRemoteModule` 하나로 통일돼 있고 그 반환 타입이
`RemoteModule<K>` 이므로, 서버 경로도 **같은 타입을 쓴다** — DTS 가 그 내용을 정하게 된
지금은 서버 경로의 타입도 remote 에서 온다. 그 진입점 맵이 웹 `exposes` 와 같은지는
6단계의 `server-entry.test.tsx` 가 본다.

`extractThirdParty` 는 여전히 안 된다. remote 가 다른 저장소로 나가는 날
`@mfa/contracts` 에 CJS 진입점을 붙이는 것이 첫 작업이다(known-issues I-3).

## 2026-09-01 (26차·b) — catalog dev 워밍 glob 이 테스트 파일을 잡고 있었다

`pnpm dev` 기동 로그에 catalog 쪽 에러가 매번 찍혔다.

```
[vite] (client) Pre-transform error: Failed to resolve import "@tests/helpers/globals"
from "src/exposes/exposes.test.tsx"
```

`vite.config.ts` 가 `server.warmup.clientFiles` 와 `optimizeDeps.entries` 를
`src/exposes/*.tsx` 라는 glob 으로 적고 있었고, 그 디렉터리에는 expose 둘 말고
`exposes.test.tsx` 도 있다. `@tests` alias 는 `vitest.config.ts` 에만 있다 —
테스트는 애초에 dev 모듈 그래프에 들어갈 파일이 아니라 alias 를 추가하는 건 답이 아니다.

`exposes` 를 손으로 적는 것 자체를 없앴다. `readExposes('./src/exposes', { ignore:
[/\.test\.tsx$/] })` 가 디렉터리를 읽어 `{ exposes, files }` 를 준다. catalog 는 그
`files` 를 워밍과 스캔 진입점에도 쓴다 — expose 와 같은 목록이라 워밍이 expose 를
놓치는 경우가 성립하지 않는다. 스캔은 `@mfa/remote-config/node` 가 쥔다(번들러가 둘이라
각자 구현하면 "무엇이 expose 인가"가 갈린다 — `createMfDevMiddleware` 와 같은 이유).

**대가는 파일 하나로 공개 계약이 바뀐다는 것이다.** 그래서 각 remote 에
`src/exposes/contract.test.ts` 를 두고 스캔 결과를 `@mfa/contracts` 의 `MODULE_IDS` 와
대조한다. `Drift.tsx` 를 넣어 실제로 실패하는 것까지 확인했다. 그러려면 `MODULE_IDS` 가
런타임 값이어야 해서 계약 테스트에 있던 것을 `remote-contract.ts` 본체로 올렸다
(양방향 타입 결속은 그대로, `exposedNames(remote)` 를 같이 내보낸다).

### 계약 쪽 등록 지점도 하나로 합쳤다

`RemoteModuleMap`(타입)과 `MODULE_IDS`(값)가 같은 id 다섯 개를 **두 번** 적고 있었다.
`satisfies` 와 전수 검사로 묶어 둬서 갈라지지는 않았지만, 모듈 하나 추가에 손이 두 번 갔다.

타입에서 값을 뽑는 건 불가능하므로(타입은 런타임에 없다) **방향을 뒤집었다.**
`MODULES` 객체 하나가 SSOT 고 둘 다 거기서 파생된다.

```ts
const props = <P,>(): ComponentType<P> => undefined as unknown as ComponentType<P>;

const MODULES = {
  'catalog/ProductGrid': props<ProductGridProps>(),
  …
} satisfies Record<`${RemoteName}/${string}`, unknown>;

export type RemoteModuleMap = {
  [K in keyof typeof MODULES]: { default: (typeof MODULES)[K] };
};
export const MODULE_IDS = Object.keys(MODULES) as RemoteModuleId[];
```

`props<T>()` 는 런타임에 아무 일도 안 한다(`undefined` 를 돌려주고 아무도 안 부른다).
타입 인자만이 의미고, 그 덕에 이 객체가 "런타임에 키를 셀 수 있는 값"이면서 동시에
"각 모듈의 props 를 아는 타입"이 된다.

지운 것: `_Exhaustive` 전수 검사와 `CONTRACT_TYPE_CHECKS`. 파생이라 어긋날 수가 없다.
접두사 검사도 별도 타입 단언이 아니라 `satisfies` 의 키 타입이 **선언 자리에서** 막는다.
실측으로 확인했다.

```
error TS2353: Object literal may only specify known properties, and ''checkout/Flow''
does not exist in type 'Record<`catalog/${string}` | `cart/${string}`, unknown>'.
```

**props 타입까지 자동화하는 것은 기각했다.** 그러려면 이 패키지가 remote 소스를
import 해야 하는데, 그게 MF 의 DTS 가 하는 일이고 이미 껐다 — remote 구현이 곧 계약이
되어 host 기대치가 조용히 따라 바뀌고, `pnpm typecheck` 가 remote 기동을 요구하게 된다
(docs/01-research/03-dts-plugin-review.md). "무엇을 노출하고 그 props 가 무엇인가"는
사람이 정한다. 대신 그 선언이 **한 곳**이면 된다.

정리하면 모듈 하나 추가에 필요한 손은 이제 둘이다 — 파일을 놓고, `MODULES` 에 한 줄.
번들러 설정 두 곳은 스캔이 따라오고, 둘이 어긋나면 계약 대조 테스트가 잡는다.

같이 알아낸 것: **`optimizeDeps.entries` 를 명시하면 Vite 가 기본으로 걸던
`**/**tests**/**`·`**/coverage/**` 무시가 사라진다**(8.2.1 `globEntries`).
제외는 전적으로 우리 책임이 된다.

### 검증

- `pnpm typecheck` · `pnpm lint` · `pnpm build` 통과
- `pnpm test` — 44 파일 639개 (계약 대조 테스트 2개 추가). 파생이 실제로 막는지는
  잘못된 접두사·props 를 넣어 `tsc` 가 죽는 것으로 확인했다
- `pnpm dev` — `준비됨` 네 줄 + host Ready, pre-transform 에러 없음

## 2026-09-01 (26차) — `src/mf` 를 목적축 여섯 폴더로 나눴다

`apps/host/src/mf/` 가 평면이었다. 소스 15 + 테스트 12 가 한 층에 나란히 있어서, 파일을
열기 전에는 그게 주소 조립인지 버전 해석인지 신뢰 검증인지 이름으로 구분되지 않았다.
새 값을 어디 둘지도 매번 다시 판단해야 했다.

### 나눈 축 — 레이어가 아니라 "그 폴더가 답하는 질문"

| 폴더          | 답하는 질문                       | 파일                                                       |
| ------------- | --------------------------------- | ---------------------------------------------------------- |
| `config/`     | remote 주소는? 호출 예산은?       | `index.ts`                                                 |
| `versions/`   | 지금 가리켜야 할 버전이 무엇인가? | `index.ts` · `browser.ts` · `server.ts`                    |
| `state/`      | 이 프로세스가 지금 뭘 들고 있나?  | `cell.ts` · `warm.ts` · `loader-stats.ts`                  |
| `trust/`      | 이 remote 를 믿어도 되나?         | `index.ts`                                                 |
| `loader/`     | 어떻게 가져와서 실행하나?         | `index.ts` · `server.ts` · `react-modules.ts`              |
| `components/` | 화면에 어떻게 붙나?               | `RemoteComponent` · `RemoteBoundary` · `RemoteVersionSync` |

`server/`·`client/` 안은 검토하고 기각했다 — `versions/` 는 셋이 같이 있어야 규칙이
성립하고, `loader/index.ts` 는 isomorphic 이며, `trust/` 는 서버 로직인데 브라우저 번들에도
실린다. 근거와 "새 파일을 어디에 두나"는 ADR-018 과 `docs/02-architecture/06-host-mf-layout.md`.
**옛 경로 → 새 경로 대응표도 거기 있다** (이 문서의 25차 이하 기록은 옛 이름 그대로다).

### 같이 걷어낸 중복 5건

- **React 공유 모듈 프로브 표가 두 벌.** 브라우저용(`runtime.ts`)과 서버용
  (`server-loader.ts`)에 `'react/jsx-dev-runtime' → 'jsxDEV'` 같은 짝이 각각 적혀 있었다.
  한쪽만 어긋나면 그 모듈만 조용히 싱글턴에서 빠지고 증상은 훅이 깨지는 것뿐이다.
  → `loader/react-modules.ts` 의 `SHARED_PROBES` 하나.
- **`export { WEB_ENTRIES as REMOTE_ENTRIES }`** — 같은 값에 이름이 둘이었다. 별칭을 없애고
  진단 화면·렌더 경로가 `config` 에서 직접 읽는다.
- **`fallbackSsrEntry(remote)`** — `SSR_ENTRIES[remote]` 를 그대로 돌려주는 래퍼.
- **`constants.ts`** — 상수 하나짜리 파일. `config/` 가 remote 접근 설정을 다 들고 있다.
- **`trustedOrigins()` 가 `versions/server.ts` 에** 있었다. 신뢰 판단이므로 `trust/` 로.
  `versions/server.ts` 는 177 → 179줄이지만 내용은 "공표 버전" 하나로 좁아졌고,
  매니페스트 fetch·검증이 `fetchManifest` / `assertTrusted` 로 갈렸다(즉시실행 async IIFE 제거).

이름도 둘 바꿨다. `REMOTE_ORIGINS` → `WEB_ORIGINS`, `remoteOrigin()` → `ssrOrigin()`.
값이 같고 **출처만 다른** 위험한 쌍인데(하나는 브라우저에서도 맞고 하나는 서버 전용) 이름이
그 차이를 안 드러냈다. 이제 `WEB_ENTRIES`/`WEB_ORIGINS` 와 `SSR_ENTRIES`/`ssrOrigin()` 이 짝이다.

### 밟은 것 — 프로브 표를 합치다 빌드가 깨졌다

모듈 **실체까지** 한 파일에 담았더니 `pnpm build` 가 죽었다.

```
You're importing a component that imports react-dom/client. It only works in a
Client Component but none of its parents are marked with "use client" …
  ./apps/host/src/mf/loader/react-modules.ts → loader/server.ts → app/api/mf-revalidate/route.ts
```

`loader/server.ts` 는 Route Handler 에서도 닿아 **RSC 그래프**에 들어간다. 합치는 단위를
프로브 표로 낮추고 네임스페이스는 각 경로가 자기 그래프에서 import 하게 했다.
기록: known-issues H-1. **드리프트하는 것이 무엇인지 먼저 보고 그것만 합친다.**

### 검증

- `pnpm typecheck` · `pnpm lint` 통과
- `pnpm test` — 42 파일 632개 통과 (테스트는 소스 옆으로 같이 옮겼다)
- `pnpm build` 통과 — host 프리렌더가 remote SSR 번들을 실제로 실행하는 경로까지 확인

## 2026-09-01 (24차) — 배포본에서 remote `style.css` 만 404

배포본 Network 탭에 remote 당 `style.css` 가 둘이었다 — SSR 이 박은
`/v<version>/style.css` 는 200, 하이드레이션 때 다시 그린 `/style.css` 는 404.
화면은 안 깨지고 콘솔도 조용해서 탭을 열기 전까지 안 보였다.

### 원인 — 브라우저가 서버 전용 저장소를 읽고 있었다

`RemoteComponent` 가 CSS 주소의 버전을 서버 전용 저장소에서 읽었다. 그건
`globalCell` 이고, **host 서버 프로세스의 globalThis** 다. 브라우저에서는 언제나 비어 있어
`stylesPath(undefined)` → 배포본에 없는 `/style.css` 가 나갔다.

버전 자체는 브라우저에도 있었다(`RemoteVersionSync` 의 인라인 스크립트). 다만 그걸 읽는
코드가 `runtime.ts` 안에 있어서 **MF 엔트리 URL 만** 쓰고 있었다. 같은 이유로
`remoteCacheKey` 도 브라우저에서는 늘 `@unversioned` 였다 — A-2 가 막으려던 상태가
브라우저 쪽에서 반쯤 열려 있었다.

### 고친 것

- **`apps/host/src/mf/warm-state.ts` 분리.** 적재 상태(`isBundleReady` 등)와 warm 세대는
  "버전이 무엇인가" 가 아니라 "그 버전으로 뭘 했나" 라 축이 다르다. `versions/server.ts` 가
  238 → 177줄이 되고, 폴더 이름과 내용이 어긋나던 것도 없어졌다.
- **`apps/host/src/mf/versions/` 신설.** 버전 코드를 값이 어디서 유효한지로 갈랐다 —
  `server.ts`(공표 버전 `announcedVersion` · 조회 · 신뢰 검증 · warm), `browser.ts`(서버가
  심어준 값 `injectedEntry` · 전역 이름 상수), `index.ts`(둘 중 있는 쪽 `remoteVersion`).
  `remote-version.ts` 와 `injected-version.ts` 가 이 셋이 됐다.
- `versions/index.ts` 의 `remoteVersion()` — `injectedEntry(…)?.version ?? announcedVersion(…)?.version`.
  이름의 축은 위치가 아니라 **출처**다(공표된 / 심어준). 위치로 부르면 두 항의 모양이
  달라져(`browserVersion` vs `knownVersion(…)?.version`) 무엇을 고르는지가 안 읽힌다.
  **버전이 필요한 곳이 부를 함수는 이거 하나다.** CSS href 와 lazy 캐시 키가 둘 다 이걸 쓴다.
  `typeof window` 로 가르는 안은 버렸다 — `window` 는 있는데 주입은 없는 상태(jsdom 에서
  서버 경로를 렌더하는 테스트)가 전부 "버전 모름" 이 된다. 실측으로 4개 깨졌다.
- `runtime.ts` 는 `pinnedEntry` 만 내보낸다(재-export 없음 — 진단 화면이 `versions/browser` 를
  직접 읽는다). 주입값 읽기를 `runtime` 에 두면
  `versions/server` → `runtime` → `server-loader` → `versions/server` 순환이 된다.
  `versions/browser.ts` 는 아무것도 import 하지 않는 잎이라 그 문제가 없다.

### 테스트

629개 통과. 새 테스트가 회귀를 실제로 잡는지 `remoteVersion` 을 옛 구현으로 되돌려
확인했다 — 정확히 2개 실패(CSS href, 캐시 키), 되돌리니 통과.

- `versions/browser.test.ts` — 값 없음 → `undefined` / remote 별 격리 / 전역 이름 계약
- `versions/index.test.ts` — 공표만 / 심어준 것만 / 양쪽 다 비었을 때 / remote 별 격리
- `RemoteComponent.test.tsx` — `globalCell` 을 비운 채 심어준 값만으로 불변 경로가 나오는지

폴더를 가른 뒤 브라우저 번들도 다시 확인했다. 트리셰이킹이 이미 서버 경로를 걷어내고
있어서(`Ed25519` · 매니페스트 거부 문자열 없음) **크기 이득은 없다.** 가른 값은
"이 값이 어디서 유효한가" 가 파일 배치로 보인다는 것뿐이고, 그게 이번 버그의 원인이었다.

### 리뷰에서 하나 더 나왔다

`GET /api/lab/stats?refresh=1` 이 `globalCell` 만 갱신하고 캐시 태그는 안 깼다. 그러면
`RemoteVersionSync` 의 `"use cache"` 스크립트가 옛 버전을 계속 내서 같은 어긋남이 다시
생긴다(서버 `<link>` = 새 버전, 심어준 값 = 옛 버전). 재배포 웹훅은 이미 그 태그를 깨고
있었고 이 실험용 조회만 갈라져 있었다. **버전이 실제로 바뀐 remote 만** 만료시킨다 —
매번 깨면 캐시 실험 자체가 캐시를 못 본다. 뮤테이션으로 테스트가 회귀를 잡는 것도 확인했다.

같은 리뷰에서 `versions/index.ts` 의 `RemoteVersion` 재-export 가 소비처 0 인 것도 지웠다.

### 남은 것

배포본에 반영하려면 host 를 다시 빌드·배포해야 한다. remote 는 안 건드렸다.

---

## 2026-08-31 (23차) — 저장소를 public 으로 열기 전 점검

공개 전환은 되돌릴 수 없다(포크·크롤러·검색 인덱스). 그래서 먼저 훑었다.

### 시크릿 — 나온 게 없다

커밋 154개 전량 + 작업 트리를 봤다.

| 검사                                                             | 결과                                       |
| ---------------------------------------------------------------- | ------------------------------------------ |
| 토큰 패턴 (`ghp_` · `sk-` · `AKIA` · `xox` · `AIza` · PEM · JWT) | 0건                                        |
| `.env*` 커밋 이력                                                | 없음                                       |
| `apps/host/.env.local`                                           | gitignore 됨 + 안의 값도 주석 처리 상태    |
| 문서의 `x-mf-secret` 예시                                        | 전부 `$MF_REVALIDATE_SECRET`, 리터럴 없음  |
| Dockerfile · scripts 에 구운 시크릿                              | 없음                                       |
| `/Users/...` 절대경로                                            | 없음                                       |
| LICENSE · `private: true`                                        | MIT 있음, package.json 11개 전부 `private` |

### 고친 것

- **`DELETE /api/lab/stats` 를 배포본에서 닫았다.** 저장소 전체에서 **인증 없이 서버
  상태를 바꾸는 유일한 경로**였고, 공개되면 경로까지 문서로 공개된다.
  `proxy.ts` 가 렌더 앞에서 404 를 내고, 라우트 핸들러도 같은 조건을 다시 본다
  (`/internal/*` 과 같은 이중 방어).
- **`ci.yml` 에 `permissions: contents: read`.** 공개 저장소에서는 fork 의 PR 도 이
  워크플로를 돌린다. 그 실행이 받는 `GITHUB_TOKEN` 의 권한을 기본값에 맡기지 않는다.
- **`docs/00-progress.md` 의 맥 LAN IP 를 `$MFA_HOST_IP` 로 바꿨다.** 사설 대역이라
  위험은 낮지만 기록에 남겨둘 이유도 없다.

### 리셋은 `pnpm dev` 에서만 쓴다

캐시 모드 실험(`04-experiments/03-cache-modes.md`)은 `next start` 로 도는데, 그건
`NODE_ENV=production` 이라 리셋도 같이 막힌다. 옵트인 환경변수로 열어주는 안을
만들었다가 **뺐다** — 스위치 하나에 코드·테스트·문서 네 곳이 붙는데, 이 저장소에서
리셋을 반복하는 실험은 dev 에서 돌리면 그만이고 프로덕션 빌드에서는 서버 재시작이
곧 리셋이다(계측이 인메모리다). 닫는 조건은 `NODE_ENV === 'production'` 하나로 둔다.

### 열어둔 것과 그 근거

`/debug` 와 `GET /api/lab/stats` 는 그대로 둔다. 노출값이 remote 의 entry·exposes·버전인데
**remote 가 `mf-version.json` 으로 이미 공개하는 값**이라 추가 노출이 없다. 오히려 이쪽이
이 저장소의 시연 대상이다 — README 가 `/debug` 를 라이브 링크로 걸고 있고,
`02-architecture/04-remote-lifecycle.md` 의 배포 검증 절차가 프로덕션 `$HOST_URL` 상대로
`GET ...?refresh=1` 을 호출한다.

### 공개하면 같이 드러나는 것 (남겨두기로 한 것)

- 커밋 이메일 — 154개 커밋 전부에 박혀 있다. 바꾸려면 히스토리 재작성이 필요하다.
- 실서비스 도메인 3개(`mfa*.lakegreen.net`) — 워크플로 기본값 · README · `anatomy.html`.
  배포 파이프라인 구조가 문서로 상세히 공개된다는 뜻이기도 하다.

### 다음에 할 것

- [ ] public 전환 **후** Settings → Actions → General 의
      `Fork pull request workflows from outside collaborators` 를 확인한다.
      이 섹션은 **공개 저장소에서만 보인다** — private 상태에서는 아예 안 뜬다.
      기본값은 `Require approval for first-time contributors`.

## 2026-08-30 (22차) — pnpm 을 12.1.0 으로 올렸다

`brew upgrade pnpm` 이 11.24.0 에서 안 올라가는 데서 시작했다. brew 문제가 아니었다 —
npm `latest` dist-tag 가 아직 11.24.0 이고, 12.0.0(2026-08-26) · 12.1.0(2026-08-29) 은
`next-12` 태그에만 있다. Homebrew formula 는 `latest` 타르볼을 따라가므로 승격 전까지 못 받는다.

그리고 brew 버전은 이 저장소가 쓰는 버전이 아니다. 실측:

```
/tmp   에서 pnpm -v → 11.24.0   (brew 바이너리)
저장소 에서 pnpm -v → 11.22.0   (package.json packageManager 필드)
```

pnpm 이 `packageManager` 를 보고 그 버전을 스스로 받아 실행한다. 그래서 올릴 자리는
`packageManager` 한 곳이고, brew 는 안 건드렸다.

### 12 에서 실제로 바뀐 것 중 이 저장소에 닿는 것

- **`packageManager` 핀이 락파일에 기록된다.** `pnpm-lock.yaml` 앞에 env 문서가 붙어
  `packageManagerDependencies.pnpm: 12.1.0` 을 적는다(+2.8KB). `--frozen-lockfile` 은 이
  값이 실행 중인 pnpm 과 어긋나면 `ERR_PNPM_FROZEN_LOCKFILE_WITH_OUTDATED_LOCKFILE` 로
  죽는다. 그래서 Dockerfile 세 개의 `npm install -g pnpm@…` 도 같이 올렸다 — 안 올렸으면
  로컬·CI 는 통과하고 **이미지 빌드만** 깨졌을 것이다. CI 는 `pnpm/setup@v2` 가
  `packageManager` 를 읽으므로 손댈 게 없다.
- **`pnpm-workspace.yaml` 의 미인식 설정이 에러다**(`ERR_PNPM_UNRECOGNIZED_WORKSPACE_SETTINGS`).
  버전 핀이 있는 저장소에서는 경고가 아니라 실패다. 우리 키(`engineStrict` ·
  `minimumReleaseAgeExclude` · `onlyBuiltDependencies`)는 전부 인식됐다.
- **`engineStrict` 가 더 엄해졌다.** optional 서브트리 안의 정규 `dependencies` 로 닿는
  비호환 패키지도 이제 실패다(11 은 경고). 설치에 걸린 건 없었다.
- `minimumReleaseAge` 기본값 1440 은 11 과 같다(pnpm.io 설정 문서 확인). Dockerfile 의
  `trust_lockfile` 근거는 그대로 유효하다.

### 확인

`install` → `lint` → `typecheck` → `format:check` → `test`(614개) → `build` 전부 통과.
빌드가 통과했으니 host 프리렌더가 remote SSR 번들을 실제로 실행한 것도 그대로다.

## 2026-08-28 (21차) — 부분 프리페칭 실험을 저장소에서 걷어냈다

`docs/04-experiments/04-partial-prefetching.md` 와 16차 기록을 지웠다. 코드 · 설정에는
애초에 흔적이 없었다 — 16차 결론이 "켜지 않는다" 였고 `partialPrefetching` 은 실험 브랜치
밖으로 나온 적이 없다. 그래서 이번 삭제는 문서만 건드린다.

지운 이유는 결과가 틀려서가 아니라 **주제가 이 저장소의 것이 아니어서**다. 이 저장소가
검증하는 주장은 "Next 16 에서 런타임 MF + remote SSR 이 된다" 하나고, 프리페치 페이로드
최적화는 MF 를 켜든 끄든 똑같이 성립한다. 남겨두면 MF 증상을 볼 때 배제할 변수가 하나 는다
— 16차가 플래그를 안 켠 이유와 같은 이유로 문서도 안 남긴다.

옮겨 살린 것: remote 상품 카드가 `<Link>` 가 아니라 `onSelect` 콜백이라 그 자리에서
프리페치 · 새 탭 · 링크 복사를 잃는다는 트레이드오프. 이건 라우팅 소유권 결정의 대가라
MF 주제다. `apps/remote-catalog/src/exposes/exposes.test.tsx` 주석에 이미 있어 거기 남기고,
지워진 실험 문서를 가리키던 인용만 뗐다.

회차 번호는 다시 쓰지 않는다 — 15차와 17차 사이가 비어 있고, 다른 절들이 15차 · 17차를
이름으로 참조하므로 번호를 당기면 그 참조가 전부 어긋난다.

## 2026-08-25 (20차) — 버전 보존 개수를 한 자리로 줄였다

`stamp-remote-version.ts` 의 `KEEP_VERSIONS`(3) 를 지웠다. 빌드 dist 는 이제 **현재 버전 한 벌만**
남긴다.

보존 개수를 세는 자리가 둘이었다.

|           | `KEEP_VERSIONS`(3) | `REMOTE_KEEP_VERSIONS`(5)                       |
| --------- | ------------------ | ----------------------------------------------- |
| 대상      | 빌드 dist          | 서빙 볼륨 `/data`                               |
| 수명      | 휘발               | 배포 간 유지                                    |
| 정하는 것 | 없음               | **롤백 범위 · 캐시된 HTML 의 옛 청크 404 여부** |

이름만 닮았고 대상도 수명도 달랐다. 게다가 `0` 의 의미가 **정반대**였다 — `staleVersionDirs` 는
"현재 버전 빼고 전부 삭제", `remote-entrypoint.sh` 는 "정리 안 함". 하나로 합치려 했다면 여기서
터졌을 것이다.

빌드 dist 쪽은 애초에 관측되지 않는 값이었다. 배포는 dist 를 볼륨으로 **복사**하는 것이고
(`scripts/docker/remote-entrypoint.sh`), Docker builder 는 매번 새 스테이지에
`.dockerignore` 가 `**/dist` 를 걸러 넣으므로 버전 디렉터리가 항상 1개다 — `staleVersionDirs`
는 프로덕션에서 한 번도 지울 게 없었다. 실제로 값이 의미를 갖던 건 로컬 반복 빌드뿐이다.

`mtime` 정렬과 "SSR 번들 있는 것만 센다" 필터도 같이 지웠다. 둘 다 `keep` 개수를 세기 위한
장치였고, 남길 게 한 벌뿐이면 셀 이유가 없다. 부수 효과로 빌드가 중간에 죽어 남은 껍데기
디렉터리도 이제 정리된다.

`rm -rf` 대상을 정하는 함수라 경계 테스트는 남겼다 — `v` 접두사 밖(`assets/`)은 건드리지 않고,
롤백으로 옛 버전을 다시 공표해도 그 버전은 지우지 않는다.

## 2026-08-25 (19차) — CI 에서 테스트를 별도 job 으로 뗐다

`pnpm test` 는 17차에 `verify` job 끝에 붙였다. 그 자리는 **실패 원인을 감춘다** — PR 의 체크
목록에 `verify` 하나만 빨갛게 뜨고, 로그를 열기 전엔 포맷이 틀렸는지 테스트가 깨졌는지 모른다.

job 을 셋으로 나눴다.

| job    | 무엇                               | 대략 |
| ------ | ---------------------------------- | ---- |
| verify | lint · typecheck · format:check    | 짧다 |
| test   | vitest 단위 · 통합 (39파일 616개)  | 중간 |
| build  | remote → host, 프리렌더가 SSR 실행 | 길다 |

셋은 서로 의존하지 않아 동시에 돈다. `test` 를 `build` 에 얹지 않은 이유는 그대로다 —
`vitest.config.ts` 의 alias 가 워크스페이스 `src` 를 직접 가리켜 `pnpm build` 없이 돈다.

`verify` 안에서 `pnpm lint` · `pnpm typecheck` 가 루트 태스크(`lint:tests` ·
`typecheck:tests`)까지 함께 돈다는 사실은 주석으로 명시했다. 테스트 코드의 타입·린트가
어디서 걸리는지 파일만 보고는 알 수 없었다.

### CI 로그가 실행마다 달라지고 있었다

`test` job 로그를 보다 알았다. 기본 리포터는 `slowTestThreshold`(기본 300ms)를 넘긴 테스트만
이름을 따로 나열한다 — 그래서 어떤 파일은 이름이 줄줄이 나오고 어떤 파일은 파일명만 나온다.
기준이 실행 시간이라 **러너 부하에 따라 목록이 바뀐다.** 같은 커밋의 두 실행을 나란히 놓고
비교할 수가 없다.

`vitest.config.ts` 에서 CI 일 때만 임계값을 `Number.MAX_SAFE_INTEGER` 로 올려 목록을 없앴다.
로컬은 300ms 그대로 — 거기서는 병목을 짚어주는 신호다. `CI=1` 유무로 실제 출력을 비교해 확인했다.

덤으로 `vitest.config.ts` 머리 주석이 "테스트 코드는 전부 루트 `tests/` 에 있다"고 적혀 있었다.
17차에 소스 옆으로 옮기기 전 배치가 주석에만 남아 있었다.

## 2026-08-25 (18차) — 17차를 리뷰하고, remote 이름의 SSOT 를 하나로 줄였다

17차 diff 를 리뷰했다. 테스트 616개는 전부 초록이었지만 **테스트가 못 보는 자리**에 네 건이
있었다. 그리고 리뷰 중에 `packages/remote-config` 의 중복 하나가 드러났다.

### 테스트가 잡아주지 못한 것 — 함정 셋

전부 **616개가 초록인 채로** 숨어 있었다. 상세·로그·진단법은
[F-1 · F-2 · F-3](./05-troubleshooting/01-known-issues.md#f-18차-테스트와-turbo-설정에서-밟은-것).

| 무엇                                               | 증상                                                  | 해결                                       |
| -------------------------------------------------- | ----------------------------------------------------- | ------------------------------------------ |
| `process.env.TZ = original` 복원                   | `"undefined"` 문자열을 심어 워커 타임존이 UTC 로 굳음 | `vi.stubEnv('TZ', tz)` (`unstubEnvs` 활용) |
| `//#typecheck:scripts` inputs 에 `tests/**` 누락   | 헬퍼를 깨도 캐시된 PASS 재생                          | inputs 에 추가                             |
| `//#typecheck:tests` inputs 에 앱·패키지 소스 글롭 | 소스 고칠 때마다 무관한 검사 캐시 증발                | 제거                                       |
| `globalEnv: ["TZ"]`                                | 전체 태스크 캐시를 깬다                               | 제거 — `pnpm test` 는 turbo 를 안 탄다     |

앞의 셋은 `tsc --listFiles` 와 turbo 캐시 로그로 고치기 전/후를 각각 재현해 확인했다.
`TZ` 를 `globalEnv` 에 넣은 이유였던 `turbo/no-undeclared-env-vars` 경고는 첫 줄을 고치면서
같이 사라졌다.

### 리팩터가 조용히 넓힌 타입

`buildPayload` 를 함수로 떼면서 반환 타입을 `SignedManifestFields` 로 적었는데, 그 타입은
두 integrity 를 optional 로 둔다(host 가 서명 없는 매니페스트도 읽어야 해서). stamp 는 항상
둘 다 채우므로 호출부에 `payload.ssrIntegrity!` 가 붙어 있었다 — 나중에 진짜로 안 채우게 됐을 때
타입이 안 잡아주는 상태다. `Required<SignedManifestFields>` 로 좁히고 `!` 를 뗐다.
`remote` 파라미터도 `string` 이 아니라 `RemoteName` 이다.

### remote 이름을 세 번 적고 있었다 → ADR-017

`REMOTE_NAMES` 원소 · `REMOTES` 키 · `REMOTES[x].name` 필드. 그중 **키와 필드가 어긋나는 건
타입이 못 잡았다** — `satisfies Record<RemoteName, …>` 는 키 집합만 보고, 필드 타입이
`RemoteName` 이라 `catalog: { name: 'cart' }` 도 통과한다(실측).

`REMOTES` 를 원본으로 삼고 `RemoteName` · `REMOTE_NAMES` · `REMOTE_LIST` 를 전부 파생하게 바꿨다.
근거와 기각한 대안은 ADR-017.

### 곁가지

- `packages/remote-config` 의 node 전용 파일 경계를 파일명 나열에서 `src/node.*` 글롭으로.
  node 전용 파일이 하나 더 생기면 조용히 브라우저 쪽 프로젝트(`types: []`)에 섞였다.
- `eslint.config.js` 주석이 `tests/dom/**` 을 가리켰다 — 테스트를 소스 옆으로 옮기기 전
  배치가 주석에만 남아 있었다.
- 트러블슈팅의 깨진 앵커 링크 다섯 개. 구두점 양옆에 공백이 있으면 GitHub 앵커에 하이픈이
  **둘** 나오는데 하나로 적혀 있었다(`— ` · `@ ` · `/ `). 같은 파일에 이미 이중 하이픈을
  쓰는 링크가 셋 있어 규칙이 확정됐다. `.claude/rules/docs.md` 에 표로 남기고, 저장소 전체
  152개 링크를 훑어 확인했다.

### 검증

```
pnpm test          39 files / 616 tests
pnpm typecheck     12/12
pnpm lint          12/12
pnpm format:check  clean
pnpm build         6/6 — host 프리렌더가 remote SSR 번들을 실제로 실행
```

## 2026-08-24 (17차) — 테스트를 넣었다. 코드는 다섯 군데만 고쳤다

`pnpm build` 는 이 저장소의 유일한 주장("Next 16 에서 런타임 MF + remote SSR 이 된다")을
지키지만 **런타임 분기는 하나도 지키지 못한다.** 신뢰 경계, 서명 계약, 사용자가 고칠 수 있는
쿠키, 조용히 실패하는 경로 — 전부 무방비였다. 목록과 진척도 전문:
`docs/06-testing/01-test-plan.md`

결과는 615개 테스트, 39개 파일. e2e 는 넣지 않았다.

### 러너 — Vitest 4, 테스트는 소스 옆에

환경은 **확장자**로 가른다. `*.test.ts` 는 node, `*.test.tsx` 는 jsdom 이다. 대상이 `.ts` 여도
DOM 이 필요하면 테스트는 `.tsx` 다 — 규칙이 하나뿐이라 파일을 열지 않고도 어느 환경에서
도는지 안다. Vitest 4 에서 `vitest.workspace.ts` 는 없어졌고 루트 config 의 `test.projects` 가
그 자리를 대신한다.

두 가지를 설정으로 막아뒀다.

- **테스트가 배포 산출물에 들어가는 것.** `packages/{store,contracts,ui}` 는 `outDir: dist` 로
  emit 하므로 소스 옆의 테스트가 그대로 `dist/` 에 컴파일돼 들어간다. 각 패키지 tsconfig 의
  `exclude` 에 넣고, 대신 루트 `tsconfig.test.json` 이 저장소 전체 테스트를 한 프로그램으로 본다.
- **빌드 없이 못 도는 것.** 워크스페이스 `exports` 는 `dist` 를 가리키는데 `vitest.config.ts` 의
  alias 가 `src` 를 직접 가리킨다. turbo 태스크에 `^build` 를 걸 필요가 없어졌다.

`test` 는 일부러 turbo 에 안 태웠다. 패키지별 대응 태스크가 없어 얻는 게 캐시뿐인데,
그 대가로 `pnpm test --project=dom` 같은 러너 플래그가 turbo 에 먹힌다.

### 테스트를 위해 고친 프로덕션 코드는 다섯 군데뿐이다

전부 **top-level 실행을 함수 뒤로 옮기고 `import.meta.url === pathToFileURL(process.argv[1]).href`
가드를 씌운 것**이거나 `export` 하나를 더한 것이다. 동작은 안 바뀐다.

| 파일                              | 무엇을                                                             |
| --------------------------------- | ------------------------------------------------------------------ |
| `scripts/serve-remote-dist.ts`    | 요청 핸들러를 `createHandler(dist)` 로. 파일은 안 나눴다           |
| `scripts/wait-for-remotes.ts`     | `remoteEntryUrl` export + 폴링에 가드                              |
| `scripts/stamp-remote-version.ts` | `integrity` · `buildPayload` · `signManifest` · `staleVersionDirs` |
| `api/mf-revalidate/route.ts`      | `selfOrigin` export                                                |
| `mf/RemoteComponent.tsx`          | lazy 캐시 키를 `remoteCacheKey` 로                                 |

`serve-remote-dist.ts` 를 **파일로 나누지 않은 게 중요하다.** 각 remote 의 Dockerfile runner 는
이 파일 하나만 복사하고 `node_modules` 를 두지 않는다 — 모듈을 하나라도 만들면 그 자체로
컨테이너가 부팅에 실패한다.

### 테스트가 밝혀낸 것 두 가지

**① 다른 탭이 쿠키를 지워도 이 탭의 장바구니는 안 비워진다.** `useCartSync` 는 변경을
감지해 `rehydrate()` 를 부르지만, persist 는 저장소가 `null` 을 주면 현재 상태를 그대로 둔다
(zustand 5.0.15). 이 훅이 막으려는 건 "낡은 상태가 남의 변경을 덮어쓰는 것" 이고 쿠키가
사라진 경우는 그 시나리오가 아니라 그대로 뒀다 — 테스트에 근거를 적어 고정했다.

**② `serve-remote-dist` 의 불변 캐시 판정은 `v` 로 시작하는 첫 세그먼트 전부다.**
`/^\/v[^/]+\//` 하나로 판정하므로 `/version/` 같은 이름도 immutable 로 나간다. SSOT 를 못 읽는
경로(컨테이너)에서도 돌아야 해서 형태로만 판정하는 설계의 대가다. dist 최상위에 `v` 로
시작하는 디렉터리를 새로 만들 일이 생기면 알고 있어야 한다.

### 밟은 함정

- **테스트를 패키지 tsconfig 에서 빼면 편집기만 빨개진다.** 러너는 루트
  `tsconfig.test.json` 으로 멀쩡히 돌지만, TS 서버는 그 파일을 어느 프로젝트에도 못 넣어
  `@tests/*` · `@mfa/*` 를 전부 `ts(2307)` 로 뱉는다. 테스트를 포함하는 쪽으로 되돌리고,
  emit 하는 세 패키지만 `tsconfig.build.json` 을 따로 두어 거기서만 뺐다.
- **`vi.mock` 팩토리로 만든 mock 은 `resetModules()` 로 초기화되지 않는다.** 호출 기록이
  파일 전체에 쌓여 "몇 번 불렸나" 단언이 전부 무의미해진다. `vi.clearAllMocks()` 가 필요하다.
- **`restoreMocks: true` 는 모듈 스코프 spy 를 첫 테스트 뒤에 되돌린다.** `console.warn` 스파이를
  파일 맨 위에 한 번만 걸면 두 번째 테스트부터 진짜 콘솔이 불린다.
- **React 19 의 `precedence` 링크는 `<head>` 로 호이스팅되어 테스트 사이에 살아남는다.**
  손으로 지우면 리소스 레지스트리와 DOM 이 어긋나 **다시 삽입되지 않는다.** 개수를 절대값으로
  세지 말고 "그 주소가 붙었는가" 만 본다.
- **클라이언트 렌더에서 `useCartLines` 는 스토어를 본다.** `initialLines` 만 넘긴 컴포넌트
  테스트는 전부 빈 장바구니를 그린다 — 브라우저 동작을 보려면 스토어를 채워야 한다.
- **응답 스트림을 안 기다리면 임시 디렉터리 삭제가 ENOENT 로 튄다.** `pipe(res)` 가 테스트
  종료 뒤에 파일을 연다. 가짜 응답을 `Writable` 로 만들고 `finish` 를 기다린다.

### 다음에 할 것

- e2e (브라우저 실제 동작 · 하드 내비게이션 · 캐시 HIT 육안 판정)
- `RemoteVersionSync` — `'use cache'` 컴파일러 변환이 필요해 지금은 제외했다

## 2026-08-22 (15차) — 여러 곳에 흩어진 것들을 SSOT 로 모으고 죽은 표면을 걷어냈다

전체 소스(6.5k 줄)를 훑어 "같은 지식이 두 곳 이상에 적혀 있는 자리"를 찾았다.
아홉 군데가 나왔고, 그중 **둘은 이미 갈라져 있었다** — 즉 잠재 버그였지 취향 문제가 아니었다.

### 이미 갈라져 있던 둘

- **서명 페이로드.** `scripts/stamp-remote-version.ts` 와 host `mf/remote-trust.ts` 가
  `JSON.stringify([remote, version, ssrEntry, webEntry, ssrIntegrity, webIntegrity])` 를
  각자 손으로 적고, 주석으로 "양쪽이 같은 형식" 이라고만 적어 두었다. 사람이 지키는 계약이다.
  갈라지면 매니페스트는 멀쩡히 만들어지고 배포도 성공하는데 **host 의 검증만 실패**하고,
  원인이 두 파일의 배열 차이라는 게 어느 로그에도 안 남는다
- **`.mf-version` 빈 파일 판정.** `rsbuild.config.ts` 는 `existsSync` 만 봤고
  `rsbuild.server.config.ts` 는 빈 값까지 걸렀다(`|| ''`). 빈 `.mf-version` 이면
  웹 번들은 `dist/v` 로, SSR 번들은 `dist` 로 나가고 stamp 가 한쪽을 못 찾는다

### 한 일 — 뽑아낸 것

- [x] `@mfa/remote-config` 에 `signedPayload` · `SignedManifestFields` · `SsrExternal`.
      서명은 host ↔ remote 배포 파이프라인 사이의 계약이라 배치 SSOT 가 자리다.
      host 쪽은 재-export 만 남긴다 (신뢰 검사 함수들과 같이 쓰이므로)
- [x] `SSR_EXTERNALS` — React external 목록이 **네 곳**에 있었다(두 remote 의 SSR 빌드 설정,
      host 의 `INJECTED` 셰임, 그리고 브라우저 `shared`). 어긋나는 방향이 둘이고 증상이 다르다:
      remote 가 external 로 안 남기면 서버에서 React 가 2벌, host 가 주입 안 하면
      `예상 밖 모듈을 require 했습니다`. `INJECTED` 는 이제 `Record<SsrExternal, unknown>` 이라
      키가 하나라도 빠지면 컴파일 타임에 걸린다
- [x] `versionedPath(file, version)` — `/v<ver>/<파일>` 조립이 stamp·`stylesPath` 등에 흩어져 있었다
- [x] **신규 `@mfa/remote-config/node` 서브패스** — `readBuildVersion` · `versionedDist` ·
      `assetBase` · `createMfDevMiddleware`.
      `index.ts` 는 host 의 **브라우저 번들에 실리므로**(`stylesPath`·`MF_FILES`) `node:fs` 를
      섞을 수 없다. 그래서 진입점을 나눴고, `tsconfig.json`(`types: []`)과
      `tsconfig.node.json`(`types: ["node"]`)으로 **검사도 나눴다** — 실수로 `index.ts` 에
      node 전용 코드를 넣으면 typecheck 가 잡는다
- [x] dev·preview 미들웨어 공용화. vite·rsbuild config 가 **글자 그대로 같은 60줄**
      (서빙 대상 목록, 404 JSON 본문, MIME 분기, CORS, `no-store`)을 각자 갖고 있었다.
      번들러 타입을 import 하지 않고 node `http` 최소 표면만 받는다 — remote 가 번들러를
      갈아타도 이 파일은 안 바뀐다
- [x] host `mf/global-state.ts` 의 `globalCell(name, create)` — RSC/SSR 레이어를 넘는
      globalThis 홀더가 **네 벌**이었다(로더 계측 1 + `remote-version.ts` 3). 각자 키·Holder
      타입·`??=` 게터를 반복했다. `Symbol.for` 레지스트리 하나 안에서 이름으로 가른다.
      `@mfa/store` 의 `globalSingleton` 은 쓰지 않는다 — 그건 브라우저 런타임 상태용이고
      `'use client'` 그래프에 묶여 있어 ADR-015 가 떼어낸 걸 도로 붙이게 된다
- [x] 각 remote 의 `src/origin.tsx` — `origin` 라벨 + `originHue` 리터럴 쌍이 expose 마다
      복사돼 있었다. 이건 "이 UI 를 어느 앱이 그렸나"를 판별하는 **관측 수단**이라,
      하나만 어긋나면 관측이 거짓말을 한다
- [x] catalog `components/StockBadge.tsx` — 품절 판정과 그 색(`hue 0` vs `140`)이 짝인데
      `ProductCard`·`ProductDetail` 두 벌이었다. 한쪽만 고치면 "빨간데 재고 3" 이 나온다
- [x] `byRemote()` reduce 패턴 3곳 → `remote-endpoints.ts` 의 export 하나

### 한 일 — 걷어낸 것

- [x] 호출부 0 인 export 넷 삭제: `loaderStats.loadCount` · `warmServerBundle` ·
      `invalidateRemoteCache` · `webEntryUrl`. warm 성공 판정이 `isBundleReady` 로 바뀌면서
      남은 잔재들이다
- [x] `runtime.ts` 의 `shared` 다섯 항목 — `version`·`scope`·`shareConfig` 가 전부 같은 값이라
      표(`SHARED_MODULES`) + `Object.fromEntries` 로. 하나만 다르게 적히면 그 모듈만 조용히
      싱글턴에서 빠지고, 증상은 훅이 깨지는 것이다
- [x] `pinnedEntry`/`pinnedVersion` 의 globalThis 접근 중복 → `injectedEntry()` 하나
- [x] `server-loader.ts` 에 **같은 내용의 주석 블록이 두 개** 연달아 있던 것 정리
- [x] `/`·`/cart`·`/checkout` 의 `instant = false` 주석 15줄이 세 번 복붙돼 있던 것 →
      3줄 + `[[cart-cookie]]` 참조. **값 자체는 리터럴로 남는다** — 라우트 세그먼트 설정은
      정적 분석 대상이라 re-export 로 공유할 수 없다(14차에 확인한 그대로)

−506 / +360 줄. 순감 146줄인데 주석을 늘린 자리가 있어서, 실제 로직 감소폭은 그보다 크다.

### 밟은 함정 — `remote-config` 안에서는 상대 import 자체가 막힌 길이다

`node.ts` 가 `index.ts` 의 `MF_FILES` 를 써야 하는데, 상대 경로로는 **양쪽이 다 막힌다.**

확장자를 빼면 Node 가 못 찾는다. 이 패키지만 번들러 없이 Node 가 직접 읽기 때문이다
(`exports` 가 소스 `.ts` 를 가리킨다).

    Error [ERR_MODULE_NOT_FOUND]: Cannot find module
      packages/remote-config/src/index imported from packages/remote-config/src/node.ts

붙이면 이번엔 tsc 가 막는다.

    error TS5097: An import path can only end with a '.ts' extension
                  when 'allowImportingTsExtensions' is enabled.

그 플래그를 켜는 건 답이 아니다. **이 패키지는 빌드 산출물이 없어서 소비처의 tsc 가
이 소스를 직접 검사하므로**, 소비처 전부가 같은 플래그를 켜야 한다 — 그중엔 dist 를
emit 하는 프로젝트가 있어서 켤 수 없다.

답은 **자기 참조**였다. `import { MF_FILES } from '@mfa/remote-config'` — Node 는
`exports` 를 가진 패키지가 자기 이름을 부르는 걸 지원하고(v12.16+), tsc 는 소비처와
똑같은 경로로 해석한다. 확장자 문제 자체가 사라진다. 빌드와 typecheck 양쪽에서 확인했다.

**과정 기록:** `./index.ts` 로 고친 뒤 빌드만 돌리고 typecheck 를 다시 안 돌려서,
TS5097 을 못 본 채 커밋 하나가 나갔다. 되돌리지 않고 다음 커밋에서 고쳤다.
빌드가 통과했다고 검사가 통과한 게 아니다 — 이 저장소에서 그 둘은 서로를 대신하지 못한다.

### 검증

`typecheck` 11/11 · `lint` 11/11 · `format:check` 통과 · `build` 통과.
**라우트 표가 14차 기록과 동일하다** — `/`·`/cart`·`/checkout` = ƒ, `/lab` 계열 = ◐.
ADR-014 의 성질(장바구니가 첫 HTML 에 들어가고, 캐시 실험은 프리렌더를 유지)이 그대로다.

서명은 가장 위험한 변경이라 왕복을 따로 확인했다 — Ed25519 키쌍을 만들어 stamp 쪽 경로로
서명하고 host 쪽 경로(WebCrypto, base64 SPKI)로 검증해 통과, 필드 하나를 바꾼 페이로드는
거부. 직렬화 결과 문자열도 리팩터 전과 바이트 동일하다.

### 이어서 — `runtime.ts` 의 주석이 낡았던 것을 정정했다 (같은 날)

`shared` 위 주석은 "루트만 공유한다 · 서브엔트리를 빼는 것이 근본 해결" 이라고 적혀 있는데
실제 목록에는 서브엔트리 셋이 들어 있었다. **코드가 맞고 주석이 틀렸다** — 8차에 정정된
오진(0-4c 를 shared 문제로 잘못 짚은 것)의 잔재가 주석에만 남아 있었다.

서브엔트리를 뺀 상태를 다시 실험할 필요는 없었다. 8차가 이미 돌렸고 결과가 0-4d 에 있다.

    [Module Federation] Failed to bridge external shared module "react-dom/client"
    [ Federation Runtime ]: Remote container initialization failed. #RUNTIME-015

대신 **그 근거가 현재 버전에서도 유효한지**를 확인했고, 새 사실이 하나 나왔다 —
두 remote 가 서로 다르다.

| remote         | config 에 선언한 shared | 매니페스트에 실제로 오른 것                                 |
| -------------- | ----------------------- | ----------------------------------------------------------- |
| catalog (Vite) | `react`, `react-dom`    | **넷** — `react/jsx-runtime` · `react-dom/client` 자동 추가 |
| cart (Rsbuild) | `react`, `react-dom`    | 둘. 자동 추가 없음                                          |

host 의 서브엔트리 공유는 **catalog 쪽 플러그인 하나 때문에** 필요하다. cart 만 보고
"안 쓰는데 왜 있지" 하고 지우면 catalog 이 죽는다. 그리고 `react/jsx-dev-runtime` 은
프로덕션 매니페스트에 아예 없다 — dev 그래프에만 있으므로 **빌드만으로는 그 항목이 필요한지
알 수 없다.** 주석을 이 내용으로 갈아끼웠다.

### dev 콜드 로드 검증 — 15차가 빠뜨렸던 것

0-4d 의 교훈이 정확히 "shared 검증은 프로덕션 빌드만으로 부족하다" 인데, 정작 15차에
그 블록을 표로 리팩터해놓고 typecheck·lint·build 로 끝냈다. 뒤늦게 돌렸다.

콜드 조건(vite 사전 번들 캐시 + `.next` 삭제, 새 브라우저 세션)에서 넷을 확인했다.

- [x] 브라우저 콘솔 — 에러 0. vite·rsbuild HMR 클라이언트가 **둘 다** 붙었다
      = 두 remote 번들이 브라우저에서 실제로 평가됐다는 뜻
- [x] 렌더 — 에러 박스 0, 남은 스켈레톤 0, 상품 카드 8, origin 라벨 둘 다 정상
      (15차에 새로 만든 `ORIGIN` 상수가 실제로 맞게 렌더된다는 확인이기도 하다)
- [x] **훅** — catalog 에서 "담기" → **cart 의 배지**가 `0` → `1 · 189,000원`.
      번들 세 개를 넘나드는 유일한 경로라 React 싱글턴이나 스토어 인스턴스가 갈라졌으면
      여기서만 드러난다. 마크업은 멀쩡히 나오므로 앞의 두 줄로는 안 잡힌다
- [x] 저장 — `mfa-cart=[{"id":"kb-001","q":1}]`. cookie-codec 의 최소 표현 그대로
- [x] `/debug` — 두 remote `ok`, exposes 전부 노출, dev 라 "버전 핀 없음(폴백 엔트리)"
      (15차에 `injectedEntry()` 로 합친 경로가 정상 동작한다는 확인)

서버 쪽 성질도 같이 봤다 — `/`·`/cart`·`/checkout` 첫 HTML 에 `189,000원` 이 들어 있고
쿠키를 빼면 안 들어 있다(ADR-014). `/lab/isr` 프리렌더 HTML 에도 remote 마크업 8개.

이 절차를 known-issues **0-4e** 로 굳혔다. 다음에 `shared` 를 건드리는 사람이 같은 걸
빠뜨리지 않게, 증상 색인에도 `#RUNTIME-015` 와 "shared 고쳤는데 뭘 확인하나" 두 줄을 넣었다.

**ADR 은 쓰지 않는다.** 설계 판단이 바뀐 게 없다 — 8차의 결론이 그대로 맞았고, 낡은 주석과
빠진 검증 절차를 고쳤을 뿐이다.

## 2026-08-22 (14차) — 장바구니 초기값 통로는 유지하고 중복만 걷어낸다

"페이지마다 `readCartLines()` 를 `initialLines` props 로 넘기는 구조인데, zustand
Provider 로 바꿀 수 없나"에서 출발했다. 검토 결과 **통로는 못 바꾼다** — Provider 는
루트 레이아웃에 놓여야 하고, 그러면 쿠키 읽는 자리가 layout 으로 올라가 전 라우트가
프리렌더에서 빠진다(ADR-014 가 정확히 그걸 피한 것이다). 근거와 기각한 대안은 ADR-016.

바꿀 수 있는 건 **중복**이었고, 두 군데였다.

### 한 일

- [x] `packages/store/src/cart/use-cart-lines.ts` — `useCartLines(initialLines)`.
      탭 동기화 · 하이드레이션 경계 · 경계 전후 값 선택을 훅 하나가 쥔다.
      `CartPanel` · `CartBadge` · `CheckoutFlow` 가 같은 네 줄을 복붙하고 있었다
- [x] `useCartSync` 를 배럴에서 내렸다(내부 구현으로 강등). 둘 다 공개하면
      "탭 동기화를 누가 거는가"가 화면마다 갈린다. `useHydrated` 는 도메인에 안 묶인
      범용 훅이라 `hooks/` 표면에 그대로 둔다
- [x] host `components/CartSlot.tsx` · `CheckoutSlot.tsx` — `SiteHeaderSlot` 과 같은 꼴의
      서버 껍데기. 쿠키를 읽어 client 섹션에 넘기는 일만 한다
- [x] `/` · `/cart` · `/checkout` 에서 `readCartLines` 호출을 걷어냈다. 페이지에 남는 건
      **라우트 정책뿐**이다(`instant = false` — 세그먼트 설정은 정적 분석 대상이라
      다른 모듈에서 re-export 로 공유할 수 없다. 주석에 명시)
- [x] ADR-016

remote 파일 3개에서 −44줄, host 페이지 3개가 각각 본문 한 줄로 줄었다.

검증: `typecheck` · `lint` 11/11, `build` 통과 — **라우트 표가 그대로다**
(`/`·`/cart`·`/checkout` = ƒ, `/lab` 계열 = ◐). ADR-014 의 성질이 유지됐다는 뜻이다.

### 같은 회차 — dev 콘솔 에러 두 개를 한 줄로 잡았다

dev 에서 `Encountered a script tag while rendering React component` 가 `/`·`/cart`·
`/checkout` 에만 떴다. 레이아웃의 `RemoteVersionSync` 를 가리키고 있었지만 **원인은
거기가 아니었다** — `packages/store/src/server.ts` 1행에 `'use client'` 가 박혀 있었다
(13차 `a7738db` 부터). 서버 표면이 통째로 클라이언트 모듈이었다.

- [x] 그 한 줄 삭제. RSC 에러(`parseCartCookie is on the client`)가 전 라우트에서 0 이 됐고,
      스크립트 태그 경고도 같이 사라졌다 — 프리페치 패스가 실패해 레이아웃이 클라이언트에서
      렌더되던 게 경고의 정체였다. 자세한 인과는 known-issues E-5
- [x] `packages/store/eslint.config.js` — `src/server.ts` 한정으로 `'use client'` 금지.
      ADR-015 가 "이 불변식을 지키는 건 주석뿐"이라고 적어둔 자리를 메웠다.
      디렉티브를 도로 넣어 error 가 나는 것까지 확인했다
- [x] known-issues E-5 + 증상 색인 2줄

검증: 첫 HTML 에 장바구니가 실린다(쿠키 `kb-001×3` → `/`·`/cart`·`/checkout` 각 2회 —
헤더 배지 + 본문). 브라우저 콘솔 에러 0(4개 라우트). `build` 통과, 라우트 표 그대로.
ADR-015 의 실측도 유지 — `grep -rl zustand apps/host/.next/static` **0건**.

## 2026-08-20 (13차) — 장바구니 저장소를 쿠키로 옮긴다

새로고침 때 장바구니가 깜빡였다. 파 보니 저장소가 느린 게 아니라 **서버가 장바구니를
모른다**는 게 원인이었다. localStorage 는 브라우저에만 있으니 첫 HTML 이 반드시 비고,
하이드레이션 커밋에서 한 프레임에 값이 바뀐다. 가려서 될 문제가 아니라 **저장 위치**를 바꿨다.

### 한 일

- [x] 쿠키 포맷·복원을 `@mfa/store` 의 `cart/cookie-codec.ts` 로(처음엔 `@mfa/contracts`
      에 뒀다가 ADR-015 에서 옮겼다). `CartLine` 만 contracts 에 남는다 —
      remote props(`initialLines`)에 나타나는 **진짜** 계약이라서다
- [x] `packages/store/src/utils/cookie-storage.ts` — `createCookieStorage()`.
      쿠키 배관(읽기·쓰기·속성 조립·persist 봉투)만 맡는 **범용** 장치다.
      값의 표현은 도메인이 `read`·`write` 로 주입한다
- [x] `packages/store/src/cart/cookie-storage.ts` — 그 위의 **설정만**.
      담는 건 `[{id, q}]` 뿐이고 이름·가격은 `findProduct` 로 복원. 코덱은 이웃 파일
      `cookie-codec` 하나라 host 의 읽기 경로와 **같은 규칙**을 쓴다
- [x] `useHydrated()` 신설(`packages/store/src/hooks/`). 스토어의 서버 스냅샷은 여전히
      빈 장바구니라, 커밋 전에는 `initialLines` 를 쓰고 커밋 후 스토어로 넘어간다.
      **둘 다 같은 쿠키에서 나오므로 화면은 안 바뀐다**
- [x] host: `lib/cart-cookie.ts`(`cookies()` → `parseCartCookie`),
      `components/SiteHeaderSlot.tsx`(레이아웃 Suspense 안에서 읽는 서버 껍데기),
      `/`·`/cart`·`/checkout` 이 본문에서 읽어 `initialLines` 를 내린다
- [x] 세 라우트에 `export const instant = false` — Cache Components 의 정적 셸 검증에서
      빼는 공식 통로다. 루트 레이아웃이 아니라 그 페이지에만 건다
- [x] ADR-014, known-issues E-1 · E-2 · E-3(+ 증상 색인 3줄), 토폴로지 · SSR 문서 갱신

### 리뷰 반영 (같은 회차)

`/review` 로 교차 검토(Claude 구조화 + Codex 적대적)한 뒤 6건을 고쳤다. CRITICAL 은
없었다 — 가격을 카탈로그에서 복원하는 설계가 변조 표면을 이미 막아 놨다. 남은 건 전부
**신뢰 경계 입력 검증**과 **경계 표시**였다.

- [x] **서버만 쿠키를 두 번 벗기고 있었다.** Next 의 `cookies().get().value` 는 이미
      `decodeURIComponent` 된 값인데(`@edge-runtime/cookies`) 코덱이 또 벗겼다. 값에 `%` 가
      없어 안 터졌을 뿐이고, 하나라도 들어오면 서버는 `URIError` → 빈 장바구니, 브라우저는
      정상 파싱 — **없애려던 깜빡임이 그 모양으로 돌아온다.** 퍼센트 인코딩을 전송 규약으로
      보고 저장 매체(`readCookie` / `setItem`)로 내렸다. 나가는 바이트는 그대로라 기존
      쿠키가 계속 읽힌다
- [x] **중복 상품 줄 병합.** 조작된 쿠키가 같은 `id` 를 두 줄 넣으면 화면이 같은 React key 를
      두 번 쓰고 `setQuantity`·`remove` 가 두 줄을 동시에 건드렸다. `Map` 으로 모아 합산
      (삽입 순서 보존이라 줄 순서는 유지)
- [x] **수량 상한 `MAX_CART_QUANTITY = 99`.** `q: 1e308` 이 `Number.isFinite` 를 통과해
      합계가 `Infinity` → `∞원` 이 됐다
- [x] **쿠키 쓰기 실패 감지.** `document.cookie = ...` 는 크기 초과·차단·정책 거부에서
      전부 조용히 실패한다. 4096바이트 사전 검사 + 쓰고 되읽기. 이름당 한 번만 경고하고
      던지지 않는다(저장 실패로 화면이 죽는 쪽이 나쁘다)
- [x] **탭 간 덮어쓰기.** 탭 A 가 담은 뒤 탭 B 에서 수량을 바꾸면 B 의 낡은 전체 상태가
      쿠키를 덮어썼다. localStorage 시절에도 같았지만 성질이 바뀌었다 — 이제 서버가 맞는
      값을 `initialLines` 로 내려보내는데 클라이언트가 그걸 계속 버린다. `useCartSync` +
      `useRevalidateOnFocus` 로 포커스 복귀 때 쿠키 원문이 바뀌었을 때만 `rehydrate()`
- [x] **"화면은 바뀌지 않는다" 에 단일 탭 조건 명시**(주석 4곳 + ADR-014)
- [x] **ADR-015** — 코덱을 `@mfa/store` 의 `cart/cookie-codec.ts` 로 옮겼다. 배럴로
      내보냈다가 host 브라우저 번들에 zustand 21.8KB 가 실리는 걸 실측으로 잡았고
      (known-issues E-4), `package.json` 의 **`react-server` 조건**으로 갈랐다 — 진입점은
      여전히 `"."` 하나고 소비처 import 문도 그대로다. 조건을 뺀 대조군까지 돌려 인과 확정

검증: `typecheck` · `lint` 10/10, `build` 통과(라우트 표 변화 없음), 코덱 순수 함수
22케이스(바이트 호환 · 서버/브라우저 동치 · 중복 · 클램프 · 방어 입력) 전부 통과.

⚠️ 테스트 러너가 아직 없어서 그 22케이스가 저장소에 남아 있지 않다. `cookie-codec` 은
의존성 없는 순수 함수라 러너만 붙이면 그대로 테이블 테스트가 된다 — 다음 회차 후보.

### 실측 (CDP 로 rAF 마다 표본, 프로덕션 빌드)

| 자리          | localStorage             | 쿠키                       |
| ------------- | ------------------------ | -------------------------- |
| 헤더 배지 폭  | 97.8 → 187.6px 한 프레임 | 188.4px 고정               |
| 패널 높이     | 0 → 206.5px 한 프레임    | 366.5px 고정               |
| 변하는 프레임 | 1                        | **0** (91프레임 전부 동일) |

서버 HTML 을 직접 확인해도 값이 들어 있다 — 쿠키 없이 요청하면 `담긴 상품이 없습니다`,
쿠키를 실으면 상품명과 `🛒 장바구니 3 627,000원` 이 첫 응답에 그대로 있다.

### 라우트 렌더 방식 변화

| 라우트                      | 전  | 후  | 이유                                 |
| --------------------------- | --- | --- | ------------------------------------ |
| `/` · `/cart` · `/checkout` | ○   | ƒ   | 본문에서 쿠키를 읽는다 (의도한 대가) |
| 그 외                       | ○   | ◐   | 레이아웃 헤더만 쿠키를 읽는다        |

`/lab` 의 캐시 실험은 셸 프리렌더를 유지한다 — 헤더를 레이아웃의 기존 `<Suspense>`
**안쪽**에서 읽기 때문이다. 밖에서 읽으면 모든 라우트가 같이 죽는다.

### 판단

- **왜 가리지 않았나.** 스켈레톤도 색 없는 자리표시자도 먼저 해 봤고 둘 다 더 나빴다.
  한 프레임짜리에 로딩 UI 를 붙이면 번쩍임이 되고, **줄 수를 서버도 첫 렌더도 모르니**
  자리 크기를 맞추는 게 원리상 불가능하다
- **왜 전환 애니메이션이 아닌가.** 깜빡임은 없앨 수 있지만 **첫 화면이 여전히 틀린 값**이고
  정착까지 300ms 가 걸린다. 값이 맞는 쪽이 낫다
- **왜 최소 표현인가.** 쿠키는 요청마다 전송된다. 한글 상품명은 URL 인코딩되면 글자당
  9바이트다. 부수 효과로 카탈로그가 바뀌어도 저장된 사본이 낡지 않는다
- **쿠키 이름에 `:` 를 못 쓴다.** RFC 6265 의 구분자다. 옛 키(`mfa-nextjs:cart`)와
  이름이 달라 옛 값은 딸려오지 않는다 — 저장 매체가 바뀌었으니 그게 맞다

### 다음

- 쿠키를 서버에서 **쓰는** 경로는 없다. 담기·비우기는 전부 브라우저에서 일어난다.
  서버 액션으로 담는 흐름이 생기면 그때 `serializeCartCookie` 의 소비처가 는다

## 2026-08-20 (12차) — 구조 해부도 `docs/anatomy.html` 추가

배포 파이프라인과 host↔remote 런타임을 그림으로 설명하는 단독 HTML 문서를 넣었다.
문서가 늘어난 게 아니라 **읽는 순서가 하나 생긴 것**이다 — 그림에서 시작해 각 절의
"근거 문서" 링크로 원본 마크다운에 내려간다.

### 한 일

- [x] `docs/anatomy.html` 신설. 손으로 쓴 인라인 SVG 7장 + 표 4개 + FAQ 5개
- [x] PART 1(배포) — 푸시 갈래·이미지 빌드·컨테이너 3개, remote 볼륨 덧붙이기(불변 아티팩트),
      재배포 → 무효화 시퀀스, warm-then-revalidate 비교(4/4 → 0/4)
- [x] PART 2(런타임) — 라우터 소유권 비교(Multi-Zones 대조), 이중 로딩 경로,
      캐시 네 층, 신뢰 네 겹 게이트, 크로스 remote 상태 공유
- [x] 색은 데모 화면 규칙을 그대로 따랐다 — 보라 = catalog, 초록 = cart, 파랑 = host.
      화면에서 본 점선 색과 문서의 색이 같아야 설명이 이어진다
- [x] 라이트 · 다크 양쪽 대응. OS 설정이 기본이고 토글이 덮는다(선택은 localStorage)
- [x] 색인 갱신 — `README.md` · `docs/README.md` · `CLAUDE.md` · `.claude/rules/docs.md`
- [x] 신뢰 경계 절(2-4)을 **왜 그렇게 하는지**까지 풀어 썼다. 도표 2장 추가 —
      "해시만 대조하면 왜 뚫리나"(같은 공격, 판단 근거만 다른 두 시나리오)와
      "개인키 · 공개키 배치". 관문 이름도 알고리즘 이름이 아니라 **질문**으로 바꿨다
      (`SRI SHA-384` → `내용 해시 대조 / 받은 바이트가 그대로인가`)

### 판단

- **왜 마크다운이 아닌가.** 담는 게 문장이 아니라 경로와 순서다. ASCII 다이어그램은
  세로 흐름 하나까지가 한계고, 분기·되돌아오는 화살표·레인이 겹치면 읽히지 않는다.
  토폴로지 문서 상단의 ASCII 구성도는 그대로 둔다 — 그 범위에서는 잘 동작한다
- **SSOT 는 여전히 마크다운이다.** 해부도에는 근거를 복제하지 않고 링크만 둔다.
  설계가 바뀌면 마크다운을 먼저 고치고 그림을 따라 고친다(`.claude/rules/docs.md`)
- **암호 관련 겹은 알고리즘 이름으로 설명하지 않는다.** `SHA-384` · `Ed25519` 를 들어도
  듣는 쪽은 "암호 키로 뭔가 비교하는군요" 정도만 남는다. 그래서 각 겹을 **질문**으로 적고
  (내용이 바뀌었나 / 누가 만들었나), 해시만으로 왜 부족한지를 공격 시나리오로 보여준 뒤,
  비대칭키가 필요한 이유를 "확인만 하면 되는 쪽에 위조 능력을 주지 않는다"로 닫았다.
  알고리즘 이름은 각 상자의 셋째 줄에 각주처럼 남긴다
- **의존성을 만들지 않는다.** mermaid 나 다이어그램 라이브러리를 쓰면 렌더 경로가
  생기고 그게 다시 빌드·CI 문제가 된다. SVG 를 손으로 써서 파일 하나로 닫았다
- **한계 — GitHub 저장소 화면은 HTML 을 렌더링하지 않는다.** 받아서 브라우저로 열어야
  한다. 링크를 거는 자리마다 그 사실을 같이 적었다. 웹에서 바로 보이게 하려면
  GitHub Pages 를 붙여야 하는데, 그건 배포 대상이 하나 느는 일이라 하지 않았다

## 2026-08-19 (11차) — 장바구니 스토어를 zustand 로 이행하고 `@mfa/store` 로 분리

직접 구현한 스토어(리스너 Set · 스냅샷 재계산 · localStorage 배선 · `useSyncExternalStore`)를
`zustand/vanilla` + `persist` 로 갈아탔다. **싱글턴 배치는 그대로다** — 상태는 zustand 모듈이
아니라 스토어 인스턴스에 있으므로, 번들이 갈려도 장바구니가 하나이려면 인스턴스가
`globalThis` 에 있어야 한다. 결정 근거는 [ADR-012](./02-architecture/01-decision.md).

### 한 일

- [x] `packages/store`(`@mfa/store`) 신설 — 런타임 공유 상태의 새 SSOT.
      **도메인별 폴더**(`src/cart/`)로 나누고, 각 도메인의 공개 표면을 `<도메인>/index.ts`
      에 정한 뒤 루트 `src/index.ts` 가 모은다. 진입점은 `@mfa/store` 하나
- [x] 스토어를 `createStore()(persist(...))` 로 재작성.
      상태는 `lines` 하나, 액션 4개(`add`·`setQuantity`·`remove`·`clear`)
- [x] `persist` 미들웨어가 localStorage 를 맡는다 — `partialize` 로 `lines` 만 저장,
      `createJSONStorage` getter 가 서버에서 던져 persist 를 통째로 건너뛴다
- [x] 파생값(합계)은 상태에서 뺐다. **셀렉터가 아니라 순수 함수** `cartTotals(lines)` 다 —
      상태의 조각이 아니라 화면이 쓰는 계산값이라 구독·비교와 얽힐 이유가 없다
- [x] 훅은 `@mfa/store/cart/hooks` 로 — `useStore` 기반. `useCartLines` · `useCartTotals` ·
      `useCart` 로 쪼개 구독 범위를 좁혔다(`CartBadge` 는 합계만 구독)
- [x] **공개 표면은 둘뿐이다** — `useCart(selector)` · `cartTotals(lines)`.
      스토어 인스턴스와 팩토리는 내보내지 않는다
- [x] 상대 경로에서 `.js` 확장자를 뺐다 — `@mfa/store` 에서 시작해 `contracts` · `ui` ·
      remote 앱 소스까지 저장소 전역으로 맞췄다. 예외는 `@mfa/remote-config` 하나
      (Node 가 직접 읽는다). raw Node 로드만 깨지고 CI 는 못 잡는다는 성질은 D-1 에 기록
- [x] 셀렉터는 패키지에 정의하지 않고 **호출부가 정한다**.
      `useCart((state) => state.lines)` · `useCart((state) => state.add)`.
      비교는 훅이 `shallow` 로 못 박는다 — 객체로 묶어 뽑아도 호출부는 그대로 쓴다
- [x] 싱글턴 장치를 `src/utils/global-singleton.ts` 로 뽑았다 —
      `globalSingleton(name, create)`. 도메인마다 전역 키를 새로 파는 대신
      `Symbol.for('@mfa/store/singletons')` 레지스트리 하나를 이름으로 가른다
- [x] 스토어를 `createWithEqualityFn`(`zustand/traditional`)로 만든다. 반환값이 곧 훅이라
      배선 코드가 없고, **기본 비교 함수로 `shallow`** 를 박아 호출부가 비교를 챙기지
      않아도 된다. 도메인 쪽은
      `export const useCart = globalSingleton(STORE_NAME, createCartStore)` 한 줄
- [x] `create`(`zustand/react`)는 안 쓴다 — 비교가 `Object.is` 로 고정이라
      `useCart((state) => ({ clear, setQuantity }))` 같은 셀렉터가 무한 렌더로 간다
- [x] 호출부 6곳 이행
- [x] `@mfa/contracts` 정리 — 스토어와 zustand 의존, 스토어 때문에 있던
      tsconfig 의 `lib: ["DOM", ...]` 오버라이드 제거. 이제 타입 계약만 남았다
- [x] `@mfa/ui` 는 의존성 0 이 됐다 — cart 훅이 나가면서 contracts·zustand 둘 다 빠짐
- [x] `zustand@5.0.15` 는 `@mfa/store` 한 곳만 가진다

### 왜 contracts 에서 뺐나

contracts 는 **타입 계약**(remote 가 무엇을 노출하는가), 스토어는 **런타임 상태**(값이
변하고 구독자가 있고 localStorage 를 만진다)다. 한 패키지에 두면 타입만 필요한 소비처까지
zustand 와 DOM 타입을 끌고 온다.

cart remote 가 소유하는 안이 도메인상 가장 정직하지만 지금은 접었다 — **catalog remote 도
스토어에 쓴다**("담기"). 옮기려면 catalog 가 `onAddToCart` 콜백을 props 로 받고 host 가
cart 로 배선하는 계약 변경이 함께 필요하다. 근거와 대안은
[ADR-013](./02-architecture/01-decision.md).

### API 표면을 깎았다 — 무엇을 지웠고 무엇은 못 지우나

편의 래퍼 셋을 지웠다.

| 지운 것                   | 대체                         | 왜 지워도 되나                    |
| ------------------------- | ---------------------------- | --------------------------------- |
| `cartActions`             | `useCartActions()`           | 소비처가 전부 React 컴포넌트다    |
| `selectTotals` + 1칸 캐시 | 순수 함수 `cartTotals()`     | 렌더 중 계산이면 비교가 필요 없다 |
| `getCartStore()`          | 패키지 내부 `cartStore` 상수 | 함수 호출이 한 겹 필요 없었다     |

**전역 레지스트리 조회는 못 지운다.** 훅에서 `createCartStore()` 를 바로 부르면 번들마다
(host · catalog · cart) 스토어 인스턴스가 따로 생긴다. 증상은 "catalog 에서 담았는데
cart 배지는 0", 그리고 빌드·타입체크·린트는 전부 통과한다. 그래서 인스턴스 생성은
`createCartStore()` 에 남기되(테스트 격리용), 앱이 쓰는 것은 `globalSingleton('cart', …)` 을
거쳐 만든 `cartStore` 상수 하나다(패키지 내부에만 있다). 실측: 같은 모듈을 두 번 평가해도
인스턴스는 하나이고,
`globalThis` 의 자체 프로퍼티는 0개다(레지스트리가 심볼 키라서).

### SSR 이 그대로 안전한 이유

`useStore` 는 서버 스냅샷으로 `getInitialState()` 를 넘긴다(zustand 5.0.x `src/react.ts`).
이 값은 **스토어 생성 시점에 캐시된 초기 상태**라, persist 가 localStorage 에서 복원한
값이 섞이지 않는다. 그래서 `skipHydration` + 수동 `rehydrate()` 를 쓰지 않았다.
서버 렌더와 hydration 렌더가 둘 다 빈 장바구니라서 mismatch 가 없다.

### 밟을 뻔한 것 — zustand 5 의 셀렉터 규칙

v5 의 기본 비교는 `Object.is` 다(v4 의 얕은 비교가 빠졌다). **새 객체를 돌려주는 셀렉터**는
매 렌더 다르다고 판정되어 무한 렌더로 간다. 셀렉터를 호출부가 쓰게 만든 뒤로는 이 함정도
호출부로 옮겨가는데, 그건 스토어 쪽 사정이지 화면의 관심사가 아니다. 그래서 `useCart` 가
안에서 `shallow` 를 쓰고 비교 방식을 밖으로 열지 않는다.

훅은 `useStoreWithEqualityFn`(`zustand/traditional`) + `shallow`(`zustand/shallow`) 를 쓴다.
비교 함수를 인자로 받는 형태라 셀렉터를 감싸지 않아도 되고, 서버 스냅샷은 이 훅도
`getInitialState()` 로 가져가므로(`src/traditional.ts` 의 `useSyncExternalStoreWithSelector`
3번째 인자) hydration 안전성은 그대로다. 앱은 zustand 를 직접 의존하지 않는다 —
`shallow` 를 포함해 zustand 는 `@mfa/store` 안에만 있다.

**대가:** `zustand/traditional` 은 `use-sync-external-store` 를 optional peer 로 요구한다.
설치돼 있지 않았으므로 `@mfa/store` 의 dependencies 에 `use-sync-external-store@1.6.0` 을
추가했다. `useStore` + `useShallow` 조합이었다면 필요 없는 의존성이다.

### 실측

`pnpm typecheck` · `pnpm lint` · `pnpm build` 전부 통과(패키지 11개). host 프리렌더 HTML 에
cart remote 의 마크업이 빈 장바구니 상태로 그대로 들어있다(`담긴 상품이 없습니다`,
badge 수량 0). remote SSR 번들이 Node 에서 평가되는 경로까지 확인된 셈이다.

## 2026-08-19 (10차) — Tailwind v4 도입, remote 가 자기 CSS 를 선언한다

초판은 CSS 를 아예 안 썼다. 세 앱의 CSS 파이프라인이 제각각(Next/Turbopack · Vite ·
Rsbuild)이라 `@mfa/ui` 의 인라인 토큰(`tokens.ts`)으로 통일하는 쪽이 확실했기 때문이다.
지금은 세 번들러 모두 Tailwind v4 공식 연동이 있어서 그 회피가 필요 없어졌다.

### 한 일

- [x] `packages/tailwind-config` 신설 — `theme.css`(`@theme` 토큰 SSOT) + PostCSS 설정 원본.
      **빌드하지 않고 소스로 배포**하고 각 앱이 자기 파이프라인에서 컴파일한다
      (host·cart `@tailwindcss/postcss`, catalog `@tailwindcss/vite`)
- [x] `MF_FILES.styles` (`style.css`) 와 `stylesPath(version)` 을
      `@mfa/remote-config` 에 추가 — 주소 조립을 SSOT 안에 둔다
- [x] host 의 `RemoteComponent` 가 remote 스타일시트를 함께 건다 —
      `<link rel="stylesheet" precedence="mfa-remote">`. 모든 remote 소비가 지나가는
      단일 진입점이라 반복이 없고 누락이 불가능하다
- [x] 오리진은 `REMOTE_ORIGINS`(브라우저에서도 맞는 값), 경로는 `stylesPath(version)`
- [x] CSS 출력 규칙 고정 — catalog `cssCodeSplit: false` + `assetFileNames`,
      cart `distPath.css: ''` + `filename.css`
- [x] Vite dev 전용 미들웨어 — `/style.css` 를 `?direct` 로 변환해 `text/css` 로 돌려준다
- [x] catalog · cart 의 expose 와 `@mfa/ui` 컴포넌트를 클래스로 이행
- [x] host 화면 이행 — `layout.tsx` 가 `globals.css` 를 물고, body 기본값은 공유 base 레이어로
- [x] `@mfa/ui` 의 `tokens.ts` 제거. 남은 인라인 스타일은 런타임 값(`--hue`) 전달뿐이다
- [x] 전략·토큰·실측을 [02-architecture/05-styling.md](./02-architecture/05-styling.md) 로 분리

### 왜 host 가 remote CSS 를 안 가져오나

remote 컴포넌트는 host 페이지 안에서 렌더되는데 CSS 는 두 로딩 경로 어디로도 따라가지
않는다. 브라우저에서는 MF 런타임이 모듈만 가져오고, 서버에서는 CJS 문자열을 평가할 뿐이라
스타일시트를 실을 자리가 없다.

host 가 매니페스트를 **파싱해** CSS 주소를 캐내면 remote 의 빌드 산출물 구조에 묶인다.
대신 파일명을 계약으로 고정해 주소를 계산으로 알아내고, `<link>` 만 걸어 파싱은 브라우저에
맡긴다. 대가는 파일명 해시를 못 쓴다는 것이고, 캐시 무효화는 이미 있는 `/v<version>/`
불변 경로가 맡는다.

`<link>` 를 어디서 거는지는 한 번 옮겼다. 처음에는 remote 의 expose 마다
`<RemoteStyles />` 를 렌더했는데(계약이 remote 안에 닫힌다), expose 를 추가할 때마다
잊으면 **스타일 없는 화면이 에러 없이** 나오는 구조였다. 지금은 모든 remote 소비가 지나가는
`RemoteComponent` 에서 한 번 건다. layout 에 두는 안은 접었다 — 모든 라우트가 remote 를
로드하게 되고, CSS 를 받으려고 MF 모듈 왕복이 선행된다.

### 함정 셋

| 함정                                              | 증상                                                                                                  |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| 브라우저에서 `publicOrigin` 사용                  | 동적 env 접근이라 치환되지 않아 배포에서 `localhost` 를 가리킨다 — 오리진은 `WEB_ENTRIES` 에서 뽑는다 |
| Vite dev 가 CSS 를 JS 모듈로 서빙                 | `<link>` 로 받으면 브라우저가 **에러 없이** 통째로 무시한다                                           |
| Tailwind v4 자동 탐지가 `node_modules` 를 안 훑음 | `@mfa/ui` 가 쓰는 클래스가 조용히 빠진다 — 빌드는 성공하고 화면만 무너진다                            |

셋 다 재현 절차와 해결은 [05-troubleshooting/01-known-issues.md](./05-troubleshooting/01-known-issues.md#c-10차-tailwind-를-붙이면서-밟은-것들) 의 C 절에 있다.

### 실측

`pnpm build` 후 host 프리렌더 HTML 에 stylesheet `<link>` 3개가 전부 `<head>` 안에 있다 —
host(`precedence=next`) 하나와 remote 둘(`precedence=mfa-remote`). `index.html` 은 cart 의
expose 를 둘 렌더하는데 cart 의 `<link>` 는 하나만 남았다(React 19 중복 제거 동작 확인).
dev 에서는 버전 없는 경로가 나오고 두 remote 모두 `text/css` + `Access-Control-Allow-Origin: *`
로 응답한다.

## 2026-08-19 (9차) — 실패를 앞으로 당긴다 (CI · 버전 게이트 · 제한 시간)

기능이 아니라 **실패가 드러나는 시점**을 손본 회차다. 셋 다 같은 성격이다 —
원인이 안 보이는 자리에서 터지던 걸 원인이 보이는 자리로 옮겼다.

### 한 일

- [x] **Node 범위 고정** — `engines.node: ">=24.19.0 <25"` + `pnpm-workspace.yaml` 의
      `engineStrict: true` + `.nvmrc`. `@mfa/remote-config` 가 타입 스트리핑에 기대므로
      Node 버전이 곧 기능 요구사항이다.
- [x] **CI 도입** (`.github/workflows/ci.yml`) — job 2개. `verify`(lint · typecheck ·
      format:check) 와 `build`.
- [x] **remote 매니페스트 `version` 문자열 검증** — `assertSafeVersion` 으로 버전 디렉터리
      경로에 쓰이기 전에 형태를 확정한다.
- [x] **remote 호출에 제한 시간** — `AbortSignal.timeout(REMOTE_FETCH_TIMEOUT_MS)` 를
      버전 조회와 SSR 번들 fetch 양쪽에 건다. 실패 원인(제한 시간 초과 / 응답 이상 /
      검증 실패)을 구분해 로그에 남긴다.
- [x] 장애 격리 확인 방법을 실제 동작에 맞춰 다시 쓰고, 트러블슈팅에 **증상 색인** 추가
- [x] README 를 라이브 데모 먼저 보이도록 재배치, MIT 라이선스 추가

### 왜 이 셋인가

| 손댄 곳   | 고치기 전 증상                                                              | 고친 뒤                       |
| --------- | --------------------------------------------------------------------------- | ----------------------------- |
| Node 범위 | 설치는 통과하고 dev·프리렌더에서 `Missing initializer in const declaration` | `pnpm install` 이 먼저 막는다 |
| CI        | MF 계약이 깨져도 PR 이 초록                                                 | 빌드가 계약 테스트            |
| 제한 시간 | remote 가 응답 안 하면 host 요청이 같이 멈춘다 — 격리가 무의미              | 끊고 폴백, 원인 구분          |

빌드를 CI 에 넣은 게 핵심이다. host 의 `next build` 는 순수 컴파일이 아니라 프리렌더가
remote 의 SSR 번들을 HTTP 로 받아 **실제로 실행한다**(`apps/host/src/mf/server-loader.ts`).
그래서 빌드 통과 = "Next 16 에서 런타임 MF + SSR 이 된다"는 이 저장소의 유일한 주장이
아직 참이라는 뜻이다. 빠른 정적 검사와 붙여두면 느린 신호가 빠른 신호를 막아서 job 을 나눴다.

## 2026-08-18 (8차) — `_jsxDEV is not a function` 재발, 3차 오진 정정

`pnpm dev` 후 첫 로드에서 catalog 가 또 죽었다. 3차에서 "해결"로 적어둔 항목이라,
**그 원인 진단 자체가 틀렸다**는 뜻이었다.

### 오진 정정

3차는 원인을 "Vite 의 지연 optimizeDeps"로 보고 `optimizeDeps.entries` + `include` 를 넣었다.
그 설정은 재현 창을 좁혔을 뿐 닫지 못했다. 실제 원인은 **`@module-federation/vite` 의 expose
로더가 shared 대기를 `import()` 뒤에 두는 것**이다(1.20.7 실측).

```js
// virtual:mf-exposes:…
"./ProductGrid": async () => {
  await Promise.all([])                                  // ← 비어 있다
  const importModule = await loadExposedModule(
    "./ProductGrid",
    () => import("/src/exposes/ProductGrid.tsx")          // ← 여기서 loadShare 가 평가된다
  )
  if (dependencyPending?.then) await dependencyPending;   // ← 배리어가 import 뒤
}
```

exposes 는 automatic JSX runtime 이라 `jsxDEV` 를 **정적 import** 하고, 그 import 는 shared 를
가리킨다. 그래서 `import()` 되는 순간 공유 스코프가 비어 있으면 `jsxDEV` 가 `undefined` 로
굳는다. live binding 이라 나중에는 채워지므로 **사후 관측으로는 원인을 못 잡는다** — 리소스
타임라인을 봐야 보인다.

```
280→285  /src/exposes/ProductGrid.tsx
286→293  loadShare(react/jsx-dev-runtime)      ← 캐시 miss, undefined 로 굳는다
311→313  .vite/deps/react_jsx-dev-runtime.js   ← 실제 모듈은 20ms 뒤
```

기각된 가설: `.vite/deps` 의 `?v=<browserHash>` 스테일. 해시는 dev 재시작마다 바뀌지만
(`fdd741cb` → `b9eb7437` 실측) 브라우저는 항상 새 transform 을 받는다. 실패한 페이지에서
`.vite/deps` 요청은 전부 200 이었다.

### 한 일

- [x] `apps/remote-catalog/vite.config.ts` 에 `server.warmup.clientFiles: ["./src/exposes/*.tsx"]`
- [x] 같은 파일 `optimizeDeps` 주석 정정 — 이건 **의존성** 사전 번들링, warmup 은 **소스 파일**
      사전 transform. 단계가 달라 둘 다 필요하다
- [x] `scripts/wait-for-remotes.ts` 주석 정정 — 이 게이트는 HTTP 200 만 보므로 이 에러를 못 막는다.
      exposes 를 여기 넣지 않는 이유도 같이 적었다(매니페스트가 dev 모듈 URL 을 안 싣는다)
- [x] `docs/05-troubleshooting/01-known-issues.md` 0-4c 전면 개정

### 검증

| 조건 (dev 재시작 + 새 브라우저 세션) | 결과        |
| ------------------------------------ | ----------- |
| warmup 없음                          | ❌ 3/3 실패 |
| exposes 를 `curl` 로 수동 워밍       | ✅ 4/4 성공 |
| `server.warmup` 설정                 | ✅ 5/5 성공 |
| 같은 세션에서 새로고침 (대조)        | ✅ 5/5 성공 |
| catalog `typecheck` / `lint`         | ✅          |

### 교훈

"새로고침하면 낫는다"는 증상은 **깨진 시점의 값이 나중에 정상으로 채워져 있다**는 뜻일 수 있다.
그 상태에서 콘솔로 확인하면 전부 멀쩡해 보이고, 그래서 3차의 오진이 5차까지 살아남았다.
재현 조건을 먼저 고정하고(여기서는 dev 재시작 + 새 브라우저 세션 = 3/3), 대조군을 세운 뒤에
원인을 말해야 한다.

## 2026-08-17 (7차) — 환경변수를 remote 당 하나로

질문: **remote 하나에 환경변수가 세 벌씩 필요한가?**

`NEXT_PUBLIC_REMOTE_*_ENTRY` / `REMOTE_*_SSR_ENTRY` / `REMOTE_*_PUBLIC_URL` 셋의 실제 값은
도메인 하나였고, 다른 건 오리진 뒤에 붙는 파일명뿐이었다. 그 파일명은 이미 `MF_FILES` 에
있으니 **env 가 SSOT 를 문자열로 복제**하고 있었던 셈이다. 복제된 쪽이 어긋나면 404 가 아니라
"폴백 응답을 파싱하다 실패"로 나타나 원인이 로그에 안 보인다.

### 한 일

- [x] `RemoteEnvKeys` 를 `publicUrl` 하나로 축소 — remote N 개에 환경변수 N 개
- [x] `webManifestUrl()` / `ssrBundleUrl()` 이 오리진 + `MF_FILES` 를 조립. 호출부는 경로를 안 만든다
- [x] `NEXT_PUBLIC_` 접두사 제거 — 브라우저 전달은 `next.config.ts` → `env:` 경로를 타므로
      접두사가 하는 일이 없었다. `turbo.json` 의 와일드카드도 `REMOTE_*` 한 줄로
- [x] docker-compose / docker-host-local 을 **맥 LAN IP 단일 주소**로 전환
- [x] `docs/03-setup/03-environment.md` 신설 — 어느 `.env` 가 실제로 로드되는지가 앱마다 다르다
- [x] 스크립트 이름의 `.mjs` 잔재 정리 (`serve-remote-dist.mjs` → `.ts` 등)

### 왜 LAN IP 인가

같은 remote 오리진을 맥의 브라우저와 컨테이너(빌드·런타임)가 함께 읽는데, `localhost` 는
컨테이너 안에서 자기 자신이고 `host.docker.internal` 은 맥에서 안 풀린다. **양쪽에서 같은
곳을 가리키는 주소는 LAN IP 뿐**이라, 이걸 쓰면 docker 검증 경로에서도 remote 당 변수가
하나로 끝난다. 대안은 SSR 전용 오버라이드 변수를 하나 더 두는 것이었는데, 그건 "변수를
줄인다"는 목적과 정면으로 부딪혀서 버렸다.

### 검증

| 항목                                | 결과                                                  |
| ----------------------------------- | ----------------------------------------------------- |
| `turbo run typecheck` / `lint`      | ✅ 16/16                                              |
| `pnpm build` (host 프리렌더 포함)   | ✅ `next build exited with code 0`                    |
| 후행 슬래시 정규화 / 빈 `ARG` 폴백  | ✅ node 로 직접 확인                                  |
| `docker-host-local.sh` 전 구간      | ✅ EXIT=0                                             |
| 컨테이너 → 맥 LAN IP 도달성         | ✅ 빌드 프리렌더가 `$MFA_HOST_IP:3001` 에서 수신      |
| 컨테이너 런타임 remote SSR          | ✅ `/checkout` 에 `주문서`, ErrorBox 없음             |
| 서버가 심은 버전 경로 엔트리        | ✅ `http://$MFA_HOST_IP:3001/v<ver>/mf-manifest.json` |
| compose 변수 보간 (`MFA_HOST_IP:?`) | ✅ 미설정 시 메시지와 함께 exit 1, 설정 시 정상 해석  |

`docker compose up` 전체 기동은 안 돌렸다 — `docker-host-local.sh` 가 같은 경로(빌드 컨테이너
→ 맥 LAN IP → 퍼블리시된 포트)를 이미 통과했고, compose 쪽은 파일 보간까지만 확인했다.

### 배포 실측

Dokploy 의 Build Args · 런타임 env 를 새 이름으로 교체한 뒤(저장소 밖 작업이라 UI 에서 직접
바꿨다) main 을 push 해 세 서비스가 모두 재빌드됐다. **env 이름 변경과 코드 변경은 같이 가야
한다** — 한쪽만 바뀐 구간에서는 host 빌드가 기본값 `localhost` 를 보고 프리렌더에서 죽는다.

| 검증                    | 결과                                                                          |
| ----------------------- | ----------------------------------------------------------------------------- |
| `/checkout` remote SSR  | ✅ HTTP 200, `주문서` 포함, ErrorBox 없음                                     |
| `/` 렌더                | ✅ HTTP 200, ErrorBox 없음                                                    |
| 서버가 심은 버전 엔트리 | ✅ `https://mfa-catalog.lakegreen.net/vtmsxe7mzs/…` (공개 도메인 + 버전 경로) |
| 빌드 버전 형태          | ✅ `tmsxe7mzs` / `tmsxe82rc` — 타임스탬프                                     |
| 서명 · 무결성           | ✅ 두 remote 모두 `signature` · `ssrIntegrity` 존재                           |

remote 당 환경변수 하나로 실제 배포가 돈다는 것까지 확인했다. Dokploy 설정 슬롯은 8개에서
6개로 줄었고, 그 6개가 전부 **같은 문자열**(도메인)이라 슬롯마다 접미사를 틀릴 여지가 없다.

## 2026-08-15 (6차) — 컨테이너 배포 (Dokploy)

질문: **remote 를 host 와 독립적으로 재배포할 수 있는가?** → 배포 표면을 먼저 만들었다.

앱마다 별도 Application 으로 올렸다(당시 4개, zone 삭제 후 3개). 한 Compose 로 묶으면 "remote 만 재배포"를
아예 시도할 수 없어서 미완 항목이 그대로 남는다.

### 한 일

- [x] Dockerfile — 빌드 컨텍스트는 저장소 루트(pnpm 워크스페이스)
- [x] Next 앱 `output: "standalone"` + `outputFileTracingRoot` (isolated 링커 대응)
- [x] remote 자산 URL 을 env 로 분리 — 하드코딩된 `localhost:3001/3002` 는 배포 불가였다
- [x] remote 진입점이 `dist` 를 영속 볼륨에 **덧붙인다** — `/v<ver>/` 불변성과 롤백 보존
- [x] 매니페스트 Ed25519 서명 — 개인키는 BuildKit secret, 공개키는 host 런타임 env
- [x] Watch Paths 로 앱별 재배포 분리 (`packages/**` 는 공통)
- [x] 배포 문서 `docs/03-setup/04-dokploy.md`
- [x] `middleware.ts` → `proxy.ts` (Next 16 에서 middleware 파일 규약 deprecated)
  - 파일명과 export 이름만 바뀌고 `config.matcher` 는 그대로. 빌드 출력도 `ƒ Proxy (Middleware)`
  - 5차의 "warm 라우트 인증은 middleware 여야 한다" 결론은 그대로 유효하다 — 이름만 바뀌었다

### 배포 환경 실측

| 검증                                                | 결과                                    |
| --------------------------------------------------- | --------------------------------------- |
| remote SSR (`/checkout` 초기 HTML)                  | ✅ `주문서` 포함                        |
| 서명 강제(`MF_REQUIRE_SIGNATURE=1`)에서 remote 로드 | ✅ 통과                                 |
| 서버가 remote 버전 핀 주입                          | ✅ `/v<ver>/mf-manifest.json` 절대 URL  |
| 불변 경로 캐시 헤더                                 | ✅ `max-age=31536000, immutable`        |
| 소프트 내비 (`/` → `/checkout`)                     | ✅ document 요청 0                      |
| 크로스 remote 상태 공유 (Vite → Rsbuild)            | ✅ `0원` → `189,000원`                  |
| zone 프록시 (`/legacy-checkout`)                    | ✅ 별도 앱 응답 — 확인 후 앱 삭제(아래) |

### Multi-Zones 폐기

대조군으로 남겨뒀던 `apps/zone-checkout` 을 삭제했다. 기각 판단은 2차에서 이미 끝났고,
배포 환경에서까지 동작을 확인(assetPrefix 프록시·하이드레이션·상호작용)한 뒤로는
얻을 게 없는데 앱 하나만큼의 유지 비용이 계속 들었다.

- [x] `apps/zone-checkout` 삭제
- [x] host 의 `/legacy-checkout*` rewrite 3개 + `ZONE_CHECKOUT_URL` 제거
- [x] 헤더의 `결제(zone·비교용)` 링크 제거 → 외부 링크 분기 자체가 사라져 `SiteHeader` 가 단순해졌다
- [x] turbo `globalEnv`, `docker-compose.yml`, `.env.local`, 배포 문서에서 zone 제거
- [x] Dokploy `mfa-zone-checkout` 서비스 삭제

**기각 근거는 남긴다.** 실험 기록(`04-experiments/02-multi-zones.md`)과 ADR-003 은
"앱 삭제됨" 표시만 붙여 유지했다. 나중에 같은 질문이 왔을 때 근거 없이 다시 재보는 게
더 비싸다.

### 배포에서만 드러난 결함

- 빈 문자열 env 가 `??` 를 통과해 빌드 버전이 사라졌다 → 배포 시점 env 는 `||` 로 읽는다
- Next standalone 이 `@swc/helpers` 의 ESM 파일을 빠뜨려 컨테이너가 부팅에서 죽었다
  (빌드는 성공, 배포는 Done 으로 끝난다) → `outputFileTracingIncludes` 로 해결.
  처음엔 Dockerfile 셸 19줄로 때웠는데 Next 공식 옵션 한 줄이면 됐다.
  pnpm 쪽 노브(`nodeLinker: hoisted`, `publicHoistPattern`)는 **배치**를 바꾸는 설정이라
  이 문제와 무관했다 — 무엇이 트레이스되는지의 문제였다

### 로컬 빌드 복구

배포만 되고 **로컬에서 `pnpm build` 가 안 됐다.** host 빌드는 프리렌더 도중 remote 의
SSR 번들을 HTTP 로 받아 실행하는데, 배포에서는 remote 가 이미 공개 도메인에 떠 있어서
그 요구사항이 보이지 않았다.

turbo 로 순서를 주면 될 것 같지만 아니다. 필요한 건 "먼저 빌드"가 아니라 **"떠 있는 상태"** 다.
turbo 공식 패턴(`with` 사이드카 + 유한 readiness 프로브)을 실제로 넣어보면 순서도 준비
대기도 정확히 동작하는데, 사이드카가 `persistent` 라 **`turbo run build` 가 끝나지 않는다.**

| 조각                                  | 담당                                                                 |
| ------------------------------------- | -------------------------------------------------------------------- |
| remote 를 먼저 빌드                   | turbo (`@mfa/host#build.dependsOn`)                                  |
| 빌드 동안 `dist` 서빙 · 끝나면 내리기 | host `build` 스크립트의 `concurrently --kill-others --success first` |

처음엔 전용 래퍼(`scripts/with-remote-dist.mjs`, 221줄)를 썼다가 `concurrently` 한 줄로 접었다.
래퍼가 하던 일 중 실제로 필요했던 건 "띄웠다 내리기"뿐이었다 — 준비 대기는 경쟁이 아니었고
(바인딩 `+1ms` vs 첫 요청 `+6451ms`), no-op 분기는 `docker:build` 가 갈라지며 쓸모가 없어졌다.

- [x] `pnpm build` / `pnpm start` 콜드 상태에서 동작 (15/15 태스크, `/checkout` 에 `주문서`)
- [x] host 이미지는 이 게이트를 타지 않는다 — 태스크 이름을 나눴다(`build` / `docker:build`).
      Dockerfile 이 플래그로 turbo.json 을 되돌리는 모양은 의도가 두 파일에 흩어져서 접었다
- [x] `REMOTE_*_SSR_ENTRY` 를 host Dockerfile `ARG` 로 명시 (빌드 시점에도 필요한 값이다)
- [x] `remote-version.ts` 의 `??` → `||` (빈 `ARG` 가 `new URL("")` 로 터질 자리였다)
- [x] compose 를 2단계로 분리 — 빌드 컨테이너는 compose 네트워크 밖이라 `host.docker.internal`
- [x] `.env.local` 이 캐시를 깨게 했다 (`inputs: ["$TURBO_DEFAULT$", ".env*"]`).
      gitignore 된 파일이 기본 입력에서 빠지는데, 그 파일이 프리렌더 결과를 정하고 있었다
- [x] 이어서 `apps/host/.env.local` 자체를 삭제 — 코드 기본값의 복사본이었다.
      로컬은 이제 환경변수 설정 없이 그냥 돈다
- [x] `pnpm start` 를 `pnpm build && turbo run start` 로 — 빌드 중 임시 서버와
      remote `start` 가 같은 포트를 동시에 잡으려다 둘 다 죽었다
- [x] `WAIT_FOR_REMOTES_TIMEOUT` 을 `globalEnv` 에 등록 — A-10 을 그대로 다시 밟았다.
      `=1` 을 줬는데 60초를 기다렸고, 등록 후 1.17초

부작용으로 진단이 하나 좋아졌다. dev 서버가 떠 있는 채로 빌드하면 정적 서버가 `::` 에
붙는 데 **성공해서** 15초를 버리고 엉뚱한 결론이 났는데, 띄우기 전에 TCP 로 포트 점유를
먼저 보게 해서 1초 만에 "dev 를 내리라"고 말한다.

## 2026-08-14 (5차) — Cache Components 이행 + MFA 캐시 실측

질문: **런타임 MF 를 쓰면 Next 의 ISR·Cache Components 를 잃는가?** → **아니오.**

전제 정정: Next 16 은 `dynamic` / `revalidate` / `fetchCache` 세그먼트 설정을
`use cache` + `cacheLife` 로 **대체**했다. 그래서 host 전체를 `cacheComponents: true` 로 이행했다.

### 한 일

- [x] host 전면 이행 — 세그먼트 설정 삭제, `connection()`+`<Suspense>` / `"use cache"`+`cacheLife` 로 재표현
- [x] `/lab` 실험 하네스 — 세 라우트가 같은 remote 를 렌더, 캐시 선언만 다름
- [x] `loader-stats` — remote 번들 fetch/eval 계측 (globalThis, RSC/SSR 레이어 공유)
- [x] `/api/lab/stats`, `/api/mf-revalidate` (remote 배포 → host 캐시 무효화 웹훅)
- [x] 캐시 스코프에 `cacheTag(remoteCacheTag(remote))` — 스코프가 의존 remote 를 자기 선언
- [x] **warm-then-revalidate** — 스켈레톤이 캐시에 굳는 위험 제거
  - 무효화 신호만 globalThis 로 공유, 캐시는 레이어별 유지(레이어마다 React 가 다르다)
  - `lazy()` 캐시 키에 remote 버전 반영 — 안 하면 무효화가 로더까지 닿지 않음
  - 번들 태그와 페이지 태그 분리 + 번들은 `{ expire: 0 }` 즉시 만료
  - warm 실패 시 페이지 캐시를 건드리지 않고 502 중단
- [x] **remote 버전 핀** — remote 가 `mf-version.json` 으로 버전 공표, host 는 그걸 읽어 수렴
  - 버전 = 빌드 ID(git SHA). 웹·SSR 산출물 **전부** `v<version>/` 불변 경로로 배포
  - 소스 변경 없는 재배포도 새 버전 — 운영성 초기화 배포에서 host 가 확실히 갈아탄다
  - 웹훅 없이도 인스턴스 전부 수렴(실측 30초 = TTL) → 브로드캐스트 불필요
  - 같은 버전을 서버 엔트리와 브라우저 양쪽에 적용 → 브라우저 요청 17/17 버전 경로, 콘솔 에러 0
  - 롤백 = `mf-version.json` 만 되돌리기 (자산 3개 버전 보존)
  - remote `start` 를 번들러 preview → 공용 정적 서버로 교체 (CDN 의미론: `/v*` immutable)
- [x] **remote 신뢰 경계** — 오리진 허용 목록 + 경로 검증 + SRI 무결성 + Ed25519 서명
  - 변조 6종을 실제로 시도해 전부 거부 확인 (거부하면서 서비스는 계속 뜬다)
  - warm 은 캐시를 믿지 않고 매번 다시 받아 다시 검증
  - 개인키는 remote CI, 공개키는 host — 같은 곳에 두면 막으려던 걸 못 막는다
- [x] `/internal/mf-warm` 인증 — middleware 상수시간 시크릿 검사
  - 페이지 안 `notFound()` 는 상태 코드를 못 바꾼다(레이아웃이 이미 flush됨) → middleware 필요

### 결과

| 판정                                   | 결과                                                                    |
| -------------------------------------- | ----------------------------------------------------------------------- |
| 캐시된 HTML 에 remote 마크업           | ✅ 있음 (빌드 프리렌더 · 런타임 재생성 모두)                            |
| 캐시 HIT 구간의 remote 번들 fetch/eval | ✅ **0 / 0** (동적 라우트는 1회차 1/1)                                  |
| TTFB                                   | 동적 74→9ms vs 캐시 5→2ms                                               |
| 태그만으로 무효화                      | ✅ 됨 — 단 `cacheTag()` 로 달아야 함. `fetch` 의 `next.tags` 로는 안 됨 |
| `revalidateTag` 동작                   | SWR — 1회 `STALE` 후 백그라운드 갱신 → 새 렌더                          |
| cacheComponents 이행 비용              | 대부분 MFA 무관 (`usePathname`·`params` → Suspense)                     |
| `generateStaticParams` 빈 배열         | ❌ 금지 → host 빌드는 remote 기동에 의존                                |
| 재생성 중 스켈레톤 캐싱                | ✅ 결정적 재현(4/4) 후 warm-then-revalidate 로 해결(0/4)                |

전문: [04-experiments/03-cache-modes.md](./04-experiments/03-cache-modes.md)

## 2026-08-14 (4차) — DTS 플러그인 검토 + 3차 오진 정정

### 오진 정정

3차에서 `[ dynamic-remote-type-hints-plugin ] err: [object Event]` 의 원인을
`dts` 로 지목했는데 **틀렸다.** 실제 스위치는 **`dev` 옵션**이다.

```js
// dts-plugin/dist/index.js — DevPlugin.apply()
if (!isDev() || normalizedDev === false) return; // dev 빌드에서만
if (!normalizedDev.disableDynamicRemoteTypeHints) {
  runtimePlugins.push('.../dynamic-remote-type-hints-plugin.js');
}
```

`dts: false` 로 사라진 건 `DtsPlugin.apply()` 가 조기 return 하면서
그 안의 `DevPlugin` 도 같이 빠진 **간접 효과**였다.

3차에서 근거로 든 `grep dist/remoteEntry.js → 0` 도 **무효한 검증**이었다.
이 플러그인은 `isDev()` 때문에 프로덕션 번들에 애초에 들어가지 않는다.
`dts` 설정과 무관하게 항상 0 이 나온다.

### 실측 (catalog dev 서버가 서빙하는 모듈 그래프 스캔)

| 설정                                                         | WS 플러그인 주입 | DTS 생성 |
| ------------------------------------------------------------ | ---------------- | -------- |
| `dts: true` (기본)                                           | **있음**         | 동작     |
| `dts: true` + `dev: { disableDynamicRemoteTypeHints: true }` | **없음**         | 동작     |
| `dts: false` (현재)                                          | 없음             | 안 함    |

**즉 "DTS 를 쓰려면 콘솔 에러를 감수해야 한다"는 전제가 틀렸다.**

### 결정 유지, 근거 교체

`dts: false` 는 그대로 둔다. 다만 근거를 정정했다.

- ~~콘솔 에러 때문~~
- 타입 SSOT 가 `@mfa/contracts` 라 정보 중복
- 타입 소비가 typecheck 에 remote 기동을 요구 → CI 순서 의존

### DTS 도입 검토 (별도 문서)

[01-research/03-dts-plugin-review.md](./01-research/03-dts-plugin-review.md) 신규.
결론: **보류.** SSR 로더 경로를 커버하지 못해 `RemoteModuleMap` 을 대체할 수 없고,
얻으려던 드리프트 검증은 remote 안 타입 제약으로 비용 없이 얻을 수 있다.
`mf dts --fetch` 로 번들러 플러그인 없는 host 도 타입 소비가 가능하다는 건 PoC 로 확인했다.

### 수정 범위

문서 4개 + remote 설정 주석 2개. **동작 코드 변경 없음.**

---

## 2026-08-14 (3차) — dev 콘솔 에러 2건 제거

사용자 리포트: `/legacy-checkout` 갔다가 뒤로가기 시
`[ dynamic-remote-type-hints-plugin ] err: [object Event]`.

### 원인과 조치

| #   | 증상                                                       | 원인                                                                                                        | 조치                                                                                                              |
| --- | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| 1   | `[ dynamic-remote-type-hints-plugin ] err: [object Event]` | MF 의 `DevPlugin` 이 dev 빌드에서 주입하는 런타임 플러그인이 `ws://127.0.0.1:<port>` 연결 실패 시 콘솔 에러 | 두 remote 모두 `dts: false` (⚠️ 원인 진단은 4차에서 정정)                                                         |
| 2   | `_jsxDEV is not a function` (catalog 첫 로드 페이지에서만) | Vite dev 의 지연 optimizeDeps. remote 는 host 페이지 안에서 돌아 Vite 의 자동 새로고침이 오지 않음          | catalog 에 `optimizeDeps.entries` + `include` 지정해 기동 시 사전 번들링 (⚠️ 원인 진단은 8차에서 정정 — 재발했다) |

과정에서 오진으로 서브엔트리 공유를 제거했다가
`Failed to bridge external shared module "react-dom/client"` 를 만났다.
`@module-federation/vite` 는 서브엔트리를 shared 목록에 자동으로 올리므로 host 가 반드시 제공해야 한다.
대신 넘기는 값의 모양을 `apps/host/src/mf/interop.ts` 의 `normalizeModule()` 로 정규화했다
(브라우저 shared + 서버 로더 require 셰임 양쪽).

### 검증

| 검증                                                    | 결과                  |
| ------------------------------------------------------- | --------------------- |
| `/debug` → zone(하드) → 뒤로 → `/` → 뒤로 (dev)         | ✅ 콘솔 에러 0        |
| 동일 시나리오 (prod)                                    | ✅ 콘솔 에러 0        |
| catalog 첫 로드 순서 `/debug` → `/`                     | ✅ 상품카드 8, 에러 0 |
| SSR + 소프트 내비 전체 재검증 (dev/prod)                | ✅ 이전과 동일        |
| `grep -c dynamic-remote-type-hints dist/remoteEntry.js` | ✅ 0, 0               |
| build / lint / typecheck                                | ✅ 18/18              |

---

## 2026-08-14 (2차) — remote SSR + 소프트 내비게이션 확보

요구사항 추가: **① remote 영역 SSR 필수 ② 경계 이동은 소프트 내비게이션 필수**
초판 설계(CSR-only MF + Multi-Zones)는 두 요구를 각각 하나씩만 만족해 재설계했다.

### 한 일

- [x] `@module-federation/node` 2.7.49 검토 → peer 가 `webpack ^5.40` 이라 host(Turbopack)에 부적합, 기각
- [x] remote 를 **웹/노드 두 타깃**으로 빌드하도록 변경
  - catalog: `vite.config.server.ts` (SSR 빌드, CJS, react external)
  - cart: `rsbuild.server.config.ts` (`target: node`, `commonjs2`, react external)
  - dev 서버에서 `/mf-server.cjs` 를 서빙하는 미들웨어 추가 (Vite / Rsbuild 각각)
- [x] host 서버 로더 작성 (`apps/host/src/mf/server-loader.ts`)
  - fetch + `new Function` 으로 CJS 평가, host React 를 require 셰임으로 주입
  - node builtin 미사용 → 브라우저 번들에서도 안전
- [x] `loadRemoteModule` 을 isomorphic 으로 통합 (`typeof window` 분기)
- [x] `RemoteComponent` 의 client-only 게이트 제거 → SSR 경로 활성화
- [x] 결제 화면을 zone → **`cart/CheckoutFlow` remote 로 이전** (라우터를 host 하나로 통일)
- [x] Multi-Zone 앱을 `/legacy-checkout` 으로 이동, 비교용으로만 유지
- [x] remote 를 SSR 하는 라우트 전부 `force-dynamic`
- [x] 문서 갱신: ADR 재정리, `02-architecture/03-ssr-and-soft-nav.md` 신규

### 검증 결과

| 검증                             | 방법                        | 결과                                 |
| -------------------------------- | --------------------------- | ------------------------------------ |
| remote SSR — 상세                | `curl /products/kb-001`     | ✅ `Aurora 75` 초기 HTML 포함        |
| remote SSR — 결제                | `curl /checkout`            | ✅ `주문서` 초기 HTML 포함           |
| remote SSR — 장바구니            | `curl /cart`                | ✅ 셸 인라인                         |
| remote SSR — 홈                  | `curl /`                    | ✅ 동일 응답 내 포함(React 스트리밍) |
| 소프트 내비 `/`→`/checkout`      | Playwright document 요청 수 | ✅ **0건**                           |
| 소프트 내비 `/`→`/products/:id`  | 동일                        | ✅ **0건**                           |
| 하드 내비 `/`→`/legacy-checkout` | 동일                        | ✅ **1건** (대조군)                  |
| hydration                        | 브라우저 콘솔               | ✅ 에러/경고 **0건**                 |
| 크로스 remote 상태               | 담기 → 헤더 배지            | ✅ `0/0원` → `1/189,000원`           |
| build / lint / typecheck         | `turbo run`                 | ✅ 14/14 통과                        |

### 새로 생긴 비용

- remote 마다 빌드 산출물 2벌, dev 프로세스 2개
- host **서버**가 remote 코드를 실행 → origin 허용목록 · 무결성 검증 필요(미구현)
- Node 런타임 전용 (Edge 불가)

---

## 2026-08-14 (1차) — 초기 셋업 + 실험 A/B

### 한 일

- [x] `@module-federation/nextjs-mf` EOL 실사 (npm peer 범위 직접 조회)
- [x] 대체재 리서치 — 런타임 MF / Multi-Zones / Vite MF / single-spa / native federation
- [x] `@module-federation/vite` 검토 (사용자 요청 항목) → remote 빌드용으로 채택
- [x] pnpm + Turborepo 모노레포 스캐폴딩 (앱 4 + 패키지 4)
- [x] host: Next.js 16.3.1 / Turbopack / App Router
- [x] remote-catalog: Vite 8 + `@module-federation/vite`
- [x] remote-cart: Rsbuild 2 + `@module-federation/rsbuild-plugin` (일부러 다른 번들러)
- [x] zone-checkout: Next.js 16 Multi-Zone
- [x] 타입 안전 remote 로더 (`RemoteModuleMap` 기반)
- [x] remote 장애 격리 (`RemoteBoundary`) + 진단 화면 (`/debug`)
- [x] 크로스 remote 장바구니 상태 공유 (`globalThis` 싱글턴 + localStorage)
- [x] ESLint 10 flat config + typescript-eslint 8 + `eslint-plugin-react-hooks` 7
- [x] `pnpm build` / `lint` / `typecheck` 전부 통과
- [x] Playwright(Chromium) 로 런타임 동작 실측 검증

### 검증 결과 요약

| 검증                                 | 결과                             |
| ------------------------------------ | -------------------------------- |
| host 가 Vite remote 소비             | ✅ 상품 카드 8개 렌더            |
| host 가 Rsbuild remote 소비          | ✅ 배지 + 패널 렌더              |
| React 단일 인스턴스 공유             | ✅ 콘솔 에러 0, share scope 3    |
| 번들러가 다른 두 remote 간 상태 공유 | ✅ `0/0원` → `1/189,000원`       |
| Multi-Zone rewrite                   | ✅ `:3000/checkout` 이 zone 응답 |
| zone 으로 장바구니 인계              | ✅ localStorage 복원             |
| `next build` 프로덕션 빌드           | ✅ host 5라우트 / zone 2라우트   |

### 당시 확인된 제약

- ~~remote UI 는 SSR 되지 않음~~ → **2차에서 해소**
- ~~zone 경계는 하드 내비게이션~~ → **2차에서 Multi-Zones 자체를 기각**
- TypeScript 는 7.0.2 대신 6.0.3 고정 (typescript-eslint peer 제약) — 유효

---

## 다음에 해볼 것

- [x] remote SSR 번들 신뢰 경계 — origin 허용목록 + SRI + Ed25519 서명 (5차)
- [x] remote 버전 핀/롤백 전략 — `/v<hash>/mf-server.cjs` 불변 경로 (5차)
- [x] remote 재배포 시 host 서버 캐시 무효화 경로 → `/api/mf-revalidate` + `cacheTag` (5차)
- [x] 무효화 시 remote 번들 선 warm → 스켈레톤 위험 제거 (5차 발견 6)
- [x] `/internal/mf-warm` 접근 제어 → middleware 시크릿 검사 (5차 발견 7)
- [x] CI 에서 MF 계약 검증 — 빌드 프리렌더가 remote SSR 번들을 실제로 실행한다 (9차)
- [x] remote 호출 제한 시간 + 실패 원인 구분 (9차)
- [ ] 캐시 스코프 없이 프리렌더되는 정적 라우트(`/` 등)의 무효화 경로 정리
- [~] remote 배포 파이프라인 시뮬레이션 — 배포 표면은 만들었다(6차). 무중단 재배포 실측은 남았다
- [ ] SSR 실패 시 CSR 폴백 — 서버 로드 실패해도 브라우저에서 재시도
- [ ] 초기 로딩 성능 측정 — SSR 경로의 TTFB / LCP 정량화
- [ ] 프레임워크 혼용 remote (Vue/Svelte)로 자유도 한계 확인
- [ ] 인증 토큰 공유 전략 (현재는 장바구니만 다룸) — `packages/store/src/auth/` 로 같은 모양 반복
- [ ] 상태 소유권을 cart remote 로 넘기는 안 — catalog 가 `onAddToCart` 콜백을 받고
      host 가 cart 로 배선한다 (ADR-013 의 기각 대안)
- [ ] `@module-federation/bridge-react` 로 remote 안에 자체 라우터 두는 패턴 검증
