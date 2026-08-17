# Dokploy 배포

컨테이너 3개를 **각각 별도 Application** 으로 올린다. 한 Compose 로 묶지 않는 이유는
`docs/00-progress.md` 의 미완 항목 때문이다 — "remote 만 재배포했을 때 host 가 무중단인가"는
remote 를 host 와 독립적으로 재배포할 수 있어야 검증된다.

| 서비스               | Dockerfile                       | 포트 | 공개 도메인                   | 볼륨    |
| -------------------- | -------------------------------- | ---- | ----------------------------- | ------- |
| `mfa-host`           | `apps/host/Dockerfile`           | 3000 | 필요                          | —       |
| `mfa-remote-catalog` | `apps/remote-catalog/Dockerfile` | 3001 | 필요 (브라우저가 직접 받는다) | `/data` |
| `mfa-remote-cart`    | `apps/remote-cart/Dockerfile`    | 3002 | 필요 (브라우저가 직접 받는다) | `/data` |

셋 모두 **Build Context 는 저장소 루트(`.`)** 다. pnpm 워크스페이스라 앱 디렉터리만으로는
빌드되지 않는다. Dokploy 의 Build Type 은 `Dockerfile`, Docker Context Path 는 `.` 로 둔다.

## 왜 remote 에 볼륨이 필요한가

remote 배포 계약은 불변 아티팩트다(`scripts/stamp-remote-version.ts`).
`/v<ver>/...` 는 한 번 배포되면 내용이 바뀌지 않고, 롤백은 `mf-version.json` 만 되돌리면 끝난다.

컨테이너는 휘발이라 이미지 안의 `dist` 만 서빙하면 재배포 순간 이전 버전이 사라진다.
그러면 롤백이 불가능하고, 이미 캐시된 host HTML 이 참조하는 옛 청크가 404 가 된다.

그래서 `scripts/docker/remote-entrypoint.sh` 가 영속 볼륨(`/data`)에 **덧붙이는** 방식으로 서빙한다.

- 새 버전 디렉터리 → 추가
- 기존 버전 디렉터리 → 덮어쓰지 않음
- `mf-version.json` → 항상 교체 (현재 버전 공표)
- 보존 개수는 `REMOTE_KEEP_VERSIONS`(기본 5). `0` 이면 정리하지 않는다.

**롤백**: 볼륨의 `mf-version.json` 을 옛 버전 것으로 바꾸면 된다. 자산은 남아 있다.

## 배포 순서

remote → host 순서다. 두 가지 이유가 있다.

1. host 빌드는 `cacheComponents` 로 일부 라우트를 프리렌더한다. 그 경로가 remote 를 타면
   빌드 시점에 remote 오리진에 실제로 닿아야 한다.
2. host 의 `REMOTE_*_PUBLIC_URL` 은 배포된 remote 도메인을 가리켜야 한다.

## 환경변수

**remote 하나당 이름 하나다.** 값도 도메인 하나 — 슬롯마다 `/mf-manifest.json` 같은
접미사를 붙이지 않는다. 그 조립은 코드가 한다(`packages/remote-config` 의 `MF_FILES`).
자세한 규칙: [03-environment.md](./03-environment.md)

> ### ⚠️ 이름 변경 (7차) — 아직 안 바꿨으면 배포 전에 반드시
>
> 옛 이름은 코드가 더 이상 읽지 않는다. **에러가 아니라 기본값 `localhost` 로 조용히
> 떨어져서** host 빌드가 프리렌더에서 remote 에 못 닿아 실패한다.
>
> | 지우기                                                         | 넣기                                              |
> | -------------------------------------------------------------- | ------------------------------------------------- |
> | `NEXT_PUBLIC_REMOTE_CATALOG_ENTRY`, `REMOTE_CATALOG_SSR_ENTRY` | `REMOTE_CATALOG_PUBLIC_URL` (도메인만, 경로 없음) |
> | `NEXT_PUBLIC_REMOTE_CART_ENTRY`, `REMOTE_CART_SSR_ENTRY`       | `REMOTE_CART_PUBLIC_URL` (〃)                     |
>
> 서비스별로 넣을 자리:
>
> | 서비스         | Build Args                                            | 런타임 env                                            |
> | -------------- | ----------------------------------------------------- | ----------------------------------------------------- |
> | mfa-host       | `REMOTE_CATALOG_PUBLIC_URL`, `REMOTE_CART_PUBLIC_URL` | `REMOTE_CATALOG_PUBLIC_URL`, `REMOTE_CART_PUBLIC_URL` |
> | remote-catalog | `REMOTE_CATALOG_PUBLIC_URL`                           | —                                                     |
> | remote-cart    | `REMOTE_CART_PUBLIC_URL`                              | —                                                     |
>
> host 는 **Build Args 와 런타임 env 양쪽에 같은 값**을 넣는다(이유는 아래).
> 바꾼 뒤 배포 순서는 remote → host. `MF_REVALIDATE_SECRET` 등 나머지는 그대로다.

### 빌드 시점에 굳는 값 (Build Args — 런타임 env 로 바꿀 수 없다)

| 서비스         | Build Arg                   | 값 예시                    |
| -------------- | --------------------------- | -------------------------- |
| host           | `REMOTE_CATALOG_PUBLIC_URL` | `https://<catalog-도메인>` |
| host           | `REMOTE_CART_PUBLIC_URL`    | `https://<cart-도메인>`    |
| remote-catalog | `REMOTE_CATALOG_PUBLIC_URL` | `https://<catalog-도메인>` |
| remote-cart    | `REMOTE_CART_PUBLIC_URL`    | `https://<cart-도메인>`    |

같은 이름이 host 와 remote 양쪽에 들어간다. **같은 개념이라 같은 값이어야 한다** — remote
쪽에서는 자기 자산의 URL 접두사가 되고, host 쪽에서는 "그 remote 를 어디서 받아오는가"가
된다. 예전처럼 이름이 갈려 있으면 한쪽만 고치고 넘어갈 수 있었다.

host 에서 이 값으로 굳는 것: 브라우저가 읽는 매니페스트 URL(클라이언트 번들에 문자열로
구워진다). remote 에서 굳는 것: 청크 URL 접두사(`base` / `assetPrefix`).
**둘 다 런타임 변경 불가** — remote 도메인을 바꾸면 재빌드해야 한다.

host 에는 성격이 하나 더 붙는다. **런타임 값이면서 빌드 시점에도 필요하다.** host 빌드가
프리렌더 도중 이 오리진에서 remote 의 SSR 번들(`/mf-server.cjs`)을 실제로 받아 실행하기
때문이다. 빌드 인자로 안 넘기면 기본값(localhost)을 보고 아무것도 못 받아 빌드가 실패한다.
그래서 런타임 env 에도 **같은 값을 그대로** 넣는다(아래 표).

> Dokploy 는 `Create Environment File` 이 켜져 있으면 런타임 env 를 `.env` 로 만들어
> 빌드 컨텍스트에 넣는다. 빌드 로그의 `- Environments: .env` 가 그거고, 빌드 인자를
> 안 넣었는데도 프리렌더가 통과하던 이유였다. **그 경로에 기대지 않는다.** 저장소에 안
> 적히는 우회로라 로컬·compose·다른 PaaS 에서 전부 재현이 안 된다. 필요한 값은 Dockerfile
> 의 `ARG` 로 드러내고 빌드 인자로 명시해 넘긴다.

### 빌드 버전은 타임스탬프다 (의도한 것)

`/v<ver>/` 의 버전은 `t<base36>` 형태의 타임스탬프다. **로컬이든 컨테이너든 같다** —
`mf-build-version.ts` 에 갈래가 없다.

이 값에 필요한 성질은 "빌드마다 달라진다" 하나뿐이고, host 는 `mf-version.json` 이 바뀐
걸 보고 갈아탄다. 타임스탬프가 그걸 이미 만족한다.

한때 갈래가 셋이었다(`MF_BUILD_VERSION` → git SHA → 타임스탬프). 둘 다 지웠다.

- **`MF_BUILD_VERSION`** — 넘기는 곳이 어디에도 없었다. Dockerfile `ARG` 가 빈 문자열만
  흘려보냈고 그 빈 값을 걸러내는 가드까지 달려 있었다. 버전을 고정해 재빌드할 일도 없다 —
  롤백은 볼륨의 `mf-version.json` 을 되돌리는 것이지 재빌드가 아니다.
- **git SHA** — 컨테이너에서 애초에 동작하지 않았다. ① `.git` 이 `.dockerignore` 로 빠지고
  ② 베이스 이미지 `node:24-slim` 에 git 바이너리가 없다(실측). 로컬에서만 되는 갈래를
  남겨두면 로컬과 배포의 버전 형태가 갈려서, 로컬에서 확인한 동작이 배포와 달라진다.

잃는 건 추적성이다 — `t1a2b3c4` 만 보고 어느 커밋인지 알 수 없다. 되찾으려면 `.git` 을
컨텍스트에 넣고 `.git/HEAD` 를 직접 읽는 경로를 만들어야 한다(git 바이너리가 없으므로
`git rev-parse` 로는 안 된다).

### 런타임 env (host)

| 이름                        | 값 예시                    | 의미                                                       |
| --------------------------- | -------------------------- | ---------------------------------------------------------- |
| `REMOTE_CATALOG_PUBLIC_URL` | `https://<catalog-도메인>` | host **서버**가 SSR 번들을 받아갈 곳 (빌드 인자와 같은 값) |
| `REMOTE_CART_PUBLIC_URL`    | `https://<cart-도메인>`    | 〃                                                         |
| `MF_REVALIDATE_SECRET`      | 랜덤 문자열                | `/api/mf-revalidate` · `/internal/mf-warm` 접근 검사       |
| `REMOTE_ALLOWED_ORIGINS`    | (보통 생략)                | 생략하면 위 오리진만 허용 — 기본이 이미 닫혀 있다          |
| `MF_REMOTE_PUBLIC_KEY`      | Ed25519 공개키(base64)     | 매니페스트 서명 검증                                       |
| `MF_REQUIRE_SIGNATURE`      | `1` 또는 미설정            | `1` 이면 서명 없는 remote 를 거부                          |
| `MF_REQUIRE_INTEGRITY`      | (보통 생략)                | production 기본 활성. `0` 으로만 끌 수 있다                |

브라우저가 읽는 매니페스트 URL 은 이미 번들에 구워졌으므로, 런타임에 이 값을 다시 읽는
쪽은 host **서버**뿐이다. 내부 네트워크 주소를 쓰고 싶다면 그건 브라우저용 값과 갈라진다는
뜻이고, 지금 구조에는 그 자리가 없다 — **오리진이 remote 당 하나다.** 애초에 갈라놓으면
`REMOTE_ALLOWED_ORIGINS` 기본값도 내부 오리진이 되어 공개 도메인과 어긋난다.
공개 도메인으로 통일하는 편이 설정이 단순하고, 그게 이 구조가 기대하는 형태다.

### 서명 키

```bash
node scripts/gen-signing-key.ts
```

- 개인키(`MF_SIGNING_KEY`) → **remote 빌드**에만. Dokploy 빌드에서는 BuildKit secret
  `mf_signing_key` 로 전달한다. Build Arg 로 넘기면 이미지 히스토리에 남는다.
- 공개키(`MF_REMOTE_PUBLIC_KEY`) → **host 런타임 env**.

시크릿을 전달하지 않으면 서명 없이 빌드된다. 그 경우 host 의 `MF_REQUIRE_SIGNATURE` 를
`1` 로 두면 remote 로드가 전부 거부된다. 무결성(SRI)은 서명과 무관하게 계속 검증된다.

## remote 재배포 → host 캐시 무효화

remote 를 재배포한 뒤 host 에 알린다.

```bash
curl -X POST https://<host-도메인>/api/mf-revalidate \
  -H "x-mf-secret: $MF_REVALIDATE_SECRET" \
  -d '{"remote":"catalog"}'
```

**Dokploy Application 에는 배포 후 훅이 없다.** 설정 스키마에 `preDeploy`/`postDeploy` 계열
필드가 존재하지 않고, `command`/`args` 는 컨테이너 실행 명령 override 이며 Schedules 는 cron 이라
배포 트리거가 아니다. 그래서 이 호출은 GitHub Actions 가 맡는다 —
[`.github/workflows/mf-revalidate.yml`](../../.github/workflows/mf-revalidate.yml).

그 워크플로는 배포를 시키지 않는다. Dokploy 가 push 를 직접 받아 빌드하므로, 워크플로는
`mf-version.json` 의 버전이 바뀔 때까지 폴링하다가 그때 웹훅을 때린다. 빌드 전에 때리면
host 가 **옛 remote 로** 페이지를 다시 굽고, 정작 새 버전이 떴을 때 알릴 사람이 없어진다.

저장소 Secret 에 `MF_REVALIDATE_SECRET`(host 런타임 env 와 같은 값)이 필요하다. 도메인이
바뀌면 Variables 로 `MF_HOST_URL` / `MF_CATALOG_URL` / `MF_CART_URL` 을 덮는다.

웹훅이 닿지 않은 host 인스턴스도 `mf-version.json` 을 짧은 TTL(30초)로 읽어 번들 계층은 스스로
수렴한다. 다만 **이미 캐시된 페이지 HTML 은 태그를 깨야만 바뀐다** — `cacheLife` 의 revalidate
시간이 백스톱이고, 그 시간을 길게(`max` 등) 잡을수록 이 웹훅이 유일한 갱신 경로가 된다.

warm 자기호출은 요청 오리진이 아니라 **루프백**(`MF_SELF_ORIGIN`, 기본 `http://127.0.0.1:$PORT`)
으로 나간다. 공개 도메인을 쓰면 Traefik 을 한 바퀴 돌아 자기 자신에게 돌아오는데, 실제 배포에서
그 자기호출만 `fetch failed` 로 죽었다(같은 컨테이너의 별도 프로세스에서는 같은 주소로 200,
루프백으로는 정상). 프록시를 탈 이유가 없는 호출이라 아예 루프백으로 고정했다.

## 실제 배포 구성

| 서비스               | 공개 도메인                 | 컨테이너 이름(내부 DNS)         | 포트 |
| -------------------- | --------------------------- | ------------------------------- | ---- |
| `mfa-host`           | `mfa.lakegreen.net`         | `web-mfa-host-0es2dw`           | 3000 |
| `mfa-remote-catalog` | `mfa-catalog.lakegreen.net` | `web-mfa-remote-catalog-x4ijue` | 3001 |
| `mfa-remote-cart`    | `mfa-cart.lakegreen.net`    | `web-mfa-remote-cart-…`         | 3002 |

### Watch Paths

한 저장소에 앱이 3개라 푸시 하나가 셋을 전부 재빌드하지 않도록 서비스마다 경로를 건다.
공유 패키지가 바뀌면 소비자도 다시 빌드돼야 하므로 `packages/**` 를 모두에 넣는다.

| 서비스         | 경로                                                                    |
| -------------- | ----------------------------------------------------------------------- |
| host           | `apps/host/**`, `packages/**`, `pnpm-lock.yaml`                         |
| remote-catalog | `apps/remote-catalog/**`, `packages/**`, `scripts/**`, `pnpm-lock.yaml` |
| remote-cart    | `apps/remote-cart/**`, `packages/**`, `scripts/**`, `pnpm-lock.yaml`    |

remote 는 `scripts/**` 도 본다. 빌드 버전·서명·서빙이 전부 그 디렉터리에 있다.

Dokploy UI 에서 경로는 입력 후 **＋ 버튼을 눌러야 목록에 들어간다**. 입력만 하고 저장하면
값이 사라진다.

## 배포하면서 실제로 밟은 함정

### 값 없는 빌드 인자는 빈 문자열로 도착한다

`ARG` 를 기본값 없이 선언하고 `ENV` 로 넘기면 컨테이너 안에서 `VAR=""` 이 된다.
`??` 는 `null`/`undefined` 에서만 폴백하므로 빈 값이 그대로 설정으로 쓰인다.
당시 `MF_BUILD_VERSION` 에서 터졌다 — 버전이 빈 문자열이 되어 자산이 `dist/v<ver>/` 가
아니라 `dist/` 로 나가고 stamp 가 `dist/v/` 를 찾다 실패했다.

배포 시점 env 를 읽는 자리는 전부 `||` 를 쓴다. 지금 해당하는 곳은 `publicOrigin()`
하나다 — `MF_BUILD_VERSION` 은 그 뒤 갈래째 사라졌다(위 "빌드 버전은 타임스탬프다").

### Next standalone 이 @swc/helpers 의 ESM 파일을 빠뜨린다

빌드는 성공하고 배포도 Done 으로 끝나는데 컨테이너가 부팅에서 죽는다.

```
Cannot find module '/app/node_modules/.pnpm/next@…/node_modules/@swc/helpers/esm/_interop_require_default.js'
```

이 패키지는 `cjs/` 와 `esm/` 를 둘 다 들고 있는데, 트레이서가 CJS 조건만 따라가서
`cjs/` 와 `package.json` 만 담는다. 그런데 런타임 청크가 `esm/` 쪽을 직접 부른다.

Next 의 공식 탈출구가 정확히 이 용도다.

```ts
// apps/host/next.config.ts
outputFileTracingIncludes: {
  "/**/*": ["../../node_modules/.pnpm/@swc+helpers@*/node_modules/@swc/helpers/esm/**/*"],
},
```

값은 프로젝트 루트(`apps/host`) 기준 glob 이고, `outputFileTracingRoot` 안이면 `../` 로
밖을 가리켜도 된다. pnpm 이 isolated 링커라 실체가 `.pnpm` 아래 있어서 이 경로가 된다.

> 처음엔 Dockerfile 에서 스토어 원본을 standalone 위에 덮어쓰는 셸 19줄로 때웠다.
> pnpm 쪽 노브(`nodeLinker: hoisted`, `publicHoistPattern`)로 풀릴까 봐 문서를 뒤졌는데
> 그쪽은 **배치**를 바꾸는 설정이라 이 문제와 무관하다. 무엇이 트레이스되는지의 문제였다.

Dockerfile 에는 검증 한 줄만 남긴다. include 가 조용히 안 먹는 날을 잡기 위해서다.

```dockerfile
RUN find apps/host/.next/standalone -path '*@swc/helpers/esm/_interop_require_default.js' | grep -q .
```

### Dokploy 로그 뷰어는 실시간이 아니다

빌드 로그 다이얼로그는 열 때 한 번 읽고 갱신하지 않는다. 닫았다 열어도 같은 스냅샷이
나올 수 있다. 진행 여부는 Deployments 목록의 상태값(Running/Done/Error)으로 판단한다.

### host 빌드가 remote 오리진에 닿아야 한다

배포 순서(remote → host)가 권장이 아니라 **강제**인 이유다. host 빌드는 프리렌더 도중
remote 의 SSR 번들을 HTTP 로 받아 실행하므로, remote 가 안 떠 있으면 이렇게 죽는다.

```
Error occurred prerendering page "/_not-found"
TypeError: fetch failed ... ECONNREFUSED
```

host 이미지 빌드는 워크스페이스 remote 를 빌드하지 않는다. 그러려고 태스크 이름을 나눴다 —
이미지는 `build` 가 아니라 **`docker:build`** 를 부른다(로컬용 remote 게이트가 없는 쪽).
그렇게 안 하면 catalog 빌드 실패가 host 배포까지 끌고 내려간다.

이미지 안의 로컬 `dist` 로 대신 서빙하는 폴백도 없다 — 배포된 remote 와 다른 코드로 빌드된
host 가 나오는 게 더 나쁘기 때문이다. 근거와 실측:
[05-troubleshooting/01-known-issues.md](../05-troubleshooting/01-known-issues.md) B 절.

## 로컬 선검증

```bash
export MFA_HOST_IP=$(ipconfig getifaddr en0)   # 맥의 LAN IP. 없으면 compose 가 에러로 죽는다
docker compose up -d --build remote-catalog remote-cart
docker compose up --build host
curl -s localhost:3000/checkout | grep 주문서   # remote SSR 확인
```

두 번에 나누는 이유가 위와 같다. host **이미지를 만드는 시점에** remote 가 실제로 떠 있어야
한다. `depends_on` 은 런타임 순서지 빌드 순서가 아니다.

`MFA_HOST_IP` 가 필요한 이유: 같은 remote 오리진을 맥의 브라우저와 컨테이너(빌드·런타임)가
함께 읽는데, `localhost` 는 컨테이너 안에서 자기 자신이고 `host.docker.internal` 은 맥에서
안 풀린다. **양쪽에서 같은 곳을 가리키는 주소는 LAN IP 뿐이다.** 이 덕분에 compose 에서도
remote 당 변수가 하나로 끝난다. 배포에서는 이 자리가 공개 도메인이라 필요 없다.

`docker-compose.yml` 은 로컬 검증 전용이다. 오리진이 LAN IP 로 굳으므로 이 이미지를
그대로 배포하면 안 된다. 네트워크를 바꾸면(Wi-Fi ↔ 테더링) IP 가 바뀌니 재빌드해야 한다.
