# Dokploy 배포

컨테이너 4개를 **각각 별도 Application** 으로 올린다. 한 Compose 로 묶지 않는 이유는
`docs/00-progress.md` 의 미완 항목 때문이다 — "remote 만 재배포했을 때 host 가 무중단인가"는
remote 를 host 와 독립적으로 재배포할 수 있어야 검증된다.

| 서비스 | Dockerfile | 포트 | 공개 도메인 | 볼륨 |
| --- | --- | --- | --- | --- |
| `mfa-host` | `apps/host/Dockerfile` | 3000 | 필요 | — |
| `mfa-remote-catalog` | `apps/remote-catalog/Dockerfile` | 3001 | 필요 (브라우저가 직접 받는다) | `/data` |
| `mfa-remote-cart` | `apps/remote-cart/Dockerfile` | 3002 | 필요 (브라우저가 직접 받는다) | `/data` |
| `mfa-zone-checkout` | `apps/zone-checkout/Dockerfile` | 3003 | 불필요 (host 가 rewrite 로 프록시) | — |

네 개 모두 **Build Context 는 저장소 루트(`.`)** 다. pnpm 워크스페이스라 앱 디렉터리만으로는
빌드되지 않는다. Dokploy 의 Build Type 은 `Dockerfile`, Docker Context Path 는 `.` 로 둔다.

## 왜 remote 에 볼륨이 필요한가

remote 배포 계약은 불변 아티팩트다(`scripts/stamp-remote-version.mjs`).
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
2. host 의 `REMOTE_*_SSR_ENTRY` 는 배포된 remote 도메인을 가리켜야 한다.

## 환경변수

### 빌드 시점에 굳는 값 (Build Args — 런타임 env 로 바꿀 수 없다)

| 서비스 | Build Arg | 값 예시 |
| --- | --- | --- |
| host | `NEXT_PUBLIC_REMOTE_CATALOG_ENTRY` | `https://<catalog-도메인>/mf-manifest.json` |
| host | `NEXT_PUBLIC_REMOTE_CART_ENTRY` | `https://<cart-도메인>/mf-manifest.json` |
| host | `ZONE_CHECKOUT_URL` | `http://<zone-내부-서비스명>:3003` |
| remote-catalog | `REMOTE_CATALOG_PUBLIC_URL` | `https://<catalog-도메인>` |
| remote-catalog | `MF_BUILD_VERSION` | 커밋 SHA (선택, 없으면 타임스탬프) |
| remote-cart | `REMOTE_CART_PUBLIC_URL` | `https://<cart-도메인>` |
| remote-cart | `MF_BUILD_VERSION` | 커밋 SHA (선택) |

`NEXT_PUBLIC_*` 은 클라이언트 번들에 문자열로 구워진다. `REMOTE_*_PUBLIC_URL` 은
청크 URL 접두사(`base` / `assetPrefix`)가 되어 산출물 안에 박힌다. **둘 다 런타임 변경 불가.**
remote 도메인을 바꾸면 재빌드해야 한다.

`.git` 은 빌드 컨텍스트에서 제외된다(`.dockerignore`). 그래서 `mf-build-version.mjs` 의
git SHA 폴백이 동작하지 않고 타임스탬프 버전이 나온다. 커밋과 배포 버전을 맞추려면
`MF_BUILD_VERSION` 을 명시적으로 넘긴다.

### 런타임 env (host)

| 이름 | 값 예시 | 의미 |
| --- | --- | --- |
| `REMOTE_CATALOG_SSR_ENTRY` | `https://<catalog-도메인>/mf-server.cjs` | host **서버**가 받아 실행할 node 번들 |
| `REMOTE_CART_SSR_ENTRY` | `https://<cart-도메인>/mf-server.cjs` | 〃 |
| `ZONE_CHECKOUT_URL` | `http://<zone-내부-서비스명>:3003` | rewrite 대상 |
| `MF_REVALIDATE_SECRET` | 랜덤 문자열 | `/api/mf-revalidate` · `/internal/mf-warm` 접근 검사 |
| `REMOTE_ALLOWED_ORIGINS` | (보통 생략) | 생략하면 위 SSR 엔트리 오리진만 허용 — 기본이 이미 닫혀 있다 |
| `MF_REMOTE_PUBLIC_KEY` | Ed25519 공개키(base64) | 매니페스트 서명 검증 |
| `MF_REQUIRE_SIGNATURE` | `1` 또는 미설정 | `1` 이면 서명 없는 remote 를 거부 |
| `MF_REQUIRE_INTEGRITY` | (보통 생략) | production 기본 활성. `0` 으로만 끌 수 있다 |

`REMOTE_*_SSR_ENTRY` 는 host **서버**가 읽는다. 내부 네트워크 주소를 써도 되지만,
그러면 `REMOTE_ALLOWED_ORIGINS` 기본값이 내부 오리진이 되어 브라우저용 공개 도메인과
어긋난다. 특별한 이유가 없으면 서버도 공개 도메인을 쓰는 편이 설정이 단순하다.

### 서명 키

```bash
node scripts/gen-signing-key.mjs
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

Dokploy 의 배포 후 커맨드(Post-deploy)나 GitHub Actions 마지막 단계에 걸어두면 된다.
웹훅이 닿지 않은 host 인스턴스는 `mf-version.json` 을 짧은 TTL 로 읽어 스스로 수렴한다.

## 실제 배포 구성

| 서비스 | 공개 도메인 | 컨테이너 이름(내부 DNS) | 포트 |
| --- | --- | --- | --- |
| `mfa-host` | `mfa.lakegreen.net` | `web-mfa-host-0es2dw` | 3000 |
| `mfa-remote-catalog` | `mfa-catalog.lakegreen.net` | `web-mfa-remote-catalog-x4ijue` | 3001 |
| `mfa-remote-cart` | `mfa-cart.lakegreen.net` | `web-mfa-remote-cart-…` | 3002 |
| `mfa-zone-checkout` | 없음 | `web-mfa-zone-checkout-of97yu` | 3003 |

zone 은 공개 도메인이 없다. host 가 `ZONE_CHECKOUT_URL=http://web-mfa-zone-checkout-of97yu:3003`
으로 dokploy-network 안에서 직접 부른다.

### Watch Paths

한 저장소에 앱이 4개라 푸시 하나가 4개를 전부 재빌드하지 않도록 서비스마다 경로를 건다.
공유 패키지가 바뀌면 소비자도 다시 빌드돼야 하므로 `packages/**` 를 모두에 넣는다.

| 서비스 | 경로 |
| --- | --- |
| host | `apps/host/**`, `packages/**`, `pnpm-lock.yaml` |
| remote-catalog | `apps/remote-catalog/**`, `packages/**`, `scripts/**`, `pnpm-lock.yaml` |
| remote-cart | `apps/remote-cart/**`, `packages/**`, `scripts/**`, `pnpm-lock.yaml` |
| zone-checkout | `apps/zone-checkout/**`, `packages/**`, `pnpm-lock.yaml` |

remote 는 `scripts/**` 도 본다. 빌드 버전·서명·서빙이 전부 그 디렉터리에 있다.

Dokploy UI 에서 경로는 입력 후 **＋ 버튼을 눌러야 목록에 들어간다**. 입력만 하고 저장하면
값이 사라진다.

## 로컬 선검증

```bash
docker compose up --build
curl -s localhost:3000/checkout | grep 주문서   # remote SSR 확인
```

`docker-compose.yml` 은 로컬 검증 전용이다. `PUBLIC_URL` 이 localhost 로 굳으므로
이 이미지를 그대로 배포하면 안 된다.
