# mfa-nextjs

Next.js 16 에서 **remote 가 SSR 되고, 모든 경계 이동이 소프트 내비게이션인**
마이크로 프론트엔드를 구성하는 실험 저장소.

```bash
pnpm install
pnpm dev        # http://localhost:3000
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

| 항목 | 측정 | 결과 |
| --- | --- | --- |
| remote SSR | `curl /checkout \| grep 주문서` | ✅ 초기 HTML 에 존재 |
| 소프트 내비 (`/`→`/checkout`) | document 요청 수 | ✅ **0** |
| hydration | 브라우저 콘솔 | ✅ 에러 0 |
| 크로스 remote 상태 공유 | 담기 → 헤더 배지 | ✅ `0원` → `189,000원` |

## 구성

| 앱 | 포트 | 번들러 | 역할 |
| --- | --- | --- | --- |
| `apps/host` | 3000 | Next.js 16 / Turbopack | 셸 · 라우팅 · remote 소비(서버+브라우저) |
| `apps/remote-catalog` | 3001 | **Vite 8** | 상품 목록 / 상세 |
| `apps/remote-cart` | 3002 | **Rsbuild 2 (Rspack)** | 장바구니 / 배지 / 결제 |

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
