# mfa-nextjs

Next.js 16 에서 **remote 가 SSR 되고, 모든 경계 이동이 소프트 내비게이션인**
마이크로 프론트엔드를 구성하는 실험 저장소.

## 지금 바로 보기

**라이브 데모 — <https://mfa.lakegreen.net>** (clone 불필요)

| 링크                                            | 뭘 보나                                                                |
| ----------------------------------------------- | ---------------------------------------------------------------------- |
| [/](https://mfa.lakegreen.net)                  | 보라 점선 = catalog(Vite), 초록 점선 = cart(Rsbuild). 담기 → 헤더 배지 |
| [/checkout](https://mfa.lakegreen.net/checkout) | 결제까지 remote 다. 헤더에서 눌러 이동하면 document 요청이 안 늘어난다 |
| [/debug](https://mfa.lakegreen.net/debug)       | MF 진단 — 두 remote 의 실제 entry 와 exposes                           |
| [/lab](https://mfa.lakegreen.net/lab)           | SSR · ISR 등가 · 태그 무효화 세 모드 비교                              |

**remote 가 정말 SSR 되는지** 는 브라우저 없이 한 줄로 확인된다. 자바스크립트를 실행하지
않고 초기 HTML 만 받아서 remote 마크업이 이미 들어있는지 보는 것이다.

```bash
curl -s https://mfa.lakegreen.net/checkout | grep -c "주문서"   # 1
```

remote 는 각자 자기 버전을 공표한다. host 는 이걸 읽고 따라온다.

```bash
curl -s https://mfa-catalog.lakegreen.net/mf-version.json
# {"remote":"catalog","version":"tmsy012z5","ssrEntry":"/vtmsy012z5/mf-server.cjs", ...}
```

## 로컬에서 돌리기

**Node `>=24.19.0 <25`, pnpm 11.x** 가 필요하다. `.nvmrc` 가 있으니 nvm · fnm 을 쓰면
`nvm use` 한 줄이면 된다. 안 맞으면 `pnpm install` 이 `ERR_PNPM_UNSUPPORTED_ENGINE`
으로 먼저 막는다.

```bash
nvm use          # 또는 fnm use
pnpm install     # rspack 바이너리 받느라 1~2분 멈춘 것처럼 보일 수 있다
pnpm dev         # http://localhost:3000
```

`pnpm dev` 는 프로세스를 다섯 개 띄운다(host 1 + remote 2개 × web·ssr).
host 는 remote 가 200 을 줄 때까지 기다렸다 뜬다 — 단 그 게이트는 60초 뒤엔
**경고만 찍고 통과한다**(`scripts/wait-for-remotes.ts`). 로그에
`[wait-remotes] ... 준비됨` 이 네 줄 다 찍혔는지로 확인한다.

**remote 가 정말 SSR 되는지** 는 이 두 줄로 확인한다. 브라우저 없이 초기 HTML 만 본다.

```bash
curl -s localhost:3000/products/kb-001 | grep -c "Aurora 75"   # 1
curl -s localhost:3000/checkout        | grep -c "주문서"       # 1
```

## 문제

`@module-federation/nextjs-mf` 는 Next.js 16 을 지원하지 않는다.

- peer 가 `next: ^12 || ^13 || ^14 || ^15` 에서 끊김 (v8.8.73 기준)
- webpack 전용인데 Next.js 16 은 Turbopack 이 기본
- App Router 는 애초에 지원한 적 없음
- 업스트림 공식 입장이 maintenance mode

그렇다고 공식 대안인 **Multi-Zones 도 답이 아니다.** zone 경계를 넘을 때
하드 내비게이션이 강제되는데, 그러면 SPA 를 유지할 이유가 사라진다.

## 해법

**① host 에 번들러 플러그인을 넣지 않는다.**
`@module-federation/runtime` 을 평범한 라이브러리로 쓴다. Turbopack 은 MF 를 몰라도 된다.

**② remote 를 웹/노드 두 타깃으로 빌드한다.**
host 서버가 노드 번들(`mf-server.cjs`)을 가져와 자기 React 를 주입하며 평가하고
실제 React 트리에 렌더한다 → **remote 가 SSR 된다.**

```ts
loadRemoteModule("cart/CheckoutFlow")
  ├─ 서버   → fetch(mf-server.cjs) + new Function + React 주입
  └─ 브라우저 → @module-federation/runtime → remoteEntry.js
```

**③ 라우터를 host 하나만 둔다.**
결제까지 remote 로 옮겨서 경계가 라우터를 가르지 않게 했다 → **전 구간 소프트 내비게이션.**

## 검증값

| 항목                          | 측정                            | 결과                   |
| ----------------------------- | ------------------------------- | ---------------------- |
| remote SSR                    | `curl /checkout \| grep 주문서` | ✅ 초기 HTML 에 존재   |
| 소프트 내비 (`/`→`/checkout`) | document 요청 수                | ✅ **0**               |
| hydration                     | 브라우저 콘솔                   | ✅ 에러 0              |
| 크로스 remote 상태 공유       | 담기 → 헤더 배지                | ✅ `0원` → `189,000원` |

## 구성

| 앱                    | 포트 | 번들러                 | 역할                                     |
| --------------------- | ---- | ---------------------- | ---------------------------------------- |
| `apps/host`           | 3000 | Next.js 16 / Turbopack | 셸 · 라우팅 · remote 소비(서버+브라우저) |
| `apps/remote-catalog` | 3001 | **Vite 8**             | 상품 목록 / 상세                         |
| `apps/remote-cart`    | 3002 | **Rsbuild 2 (Rspack)** | 장바구니 / 배지 / 결제                   |

remote 를 일부러 다른 번들러로 만들었다.
"번들러가 달라도 런타임 계약만 맞으면 된다"를 실제로 확인하기 위해서다.

## 문서

전부 [`docs/`](./docs/) 에 있다. 핵심은 **SSR + 소프트 내비게이션 설계**.

- [진행 상황](./docs/00-progress.md)
- [nextjs-mf 가 왜 죽었나](./docs/01-research/01-nextjs-mf-eol.md)
- [대체재 비교](./docs/01-research/02-alternatives.md)
- [DTS 플러그인 도입 검토 (보류)](./docs/01-research/03-dts-plugin-review.md)
- [아키텍처 결정 기록(ADR)](./docs/02-architecture/01-decision.md)
- [토폴로지](./docs/02-architecture/02-topology.md)
- **[SSR + 소프트 내비게이션](./docs/02-architecture/03-ssr-and-soft-nav.md)**
- [실행 방법](./docs/03-setup/01-getting-started.md)
- [버전 고정 근거](./docs/03-setup/02-versions.md)
- [실험 A — 런타임 MF](./docs/04-experiments/01-runtime-mf.md)
- [실험 B — Multi-Zones (기각·앱 삭제됨)](./docs/04-experiments/02-multi-zones.md)
- [트러블슈팅](./docs/05-troubleshooting/01-known-issues.md)

## 스크립트

```bash
pnpm dev         # 전체 개발 서버 (remote 는 web + ssr 두 프로세스)
pnpm build       # 전체 빌드 (remote 는 웹/노드 두 타깃)
pnpm lint
pnpm typecheck
```
