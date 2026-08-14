# Next.js 16 에서 쓸 수 있는 MFA 대체 수단

조사일: 2026-08-14

## 후보 비교표

요구사항: Next.js 16 유지 + **remote SSR** + **소프트 내비게이션**.

| 방식 | Next.js 16 | Turbopack | App Router | remote SSR | 소프트 내비 | 런타임 코드 공유 | 판정 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `@module-federation/nextjs-mf` | ❌ peer `^15` | ❌ webpack 전용 | ❌ 미지원 | ⭕ | ⭕ | ⭕ | **탈락** |
| 런타임 MF (CSR only) | ⭕ | ⭕ (무관) | ⭕ | ❌ | ⭕ | ⭕ | 탈락(SSR 없음) |
| **런타임 MF + 서버 사이드 remote 로딩** | ⭕ | ⭕ | ⭕ | **⭕** | **⭕** | ⭕ | **채택** |
| Multi-Zones (rewrites / `@vercel/microfrontends`) | ⭕ | ⭕ | ⭕ | ⭕ | **❌ 하드 강제** | ❌ | 기각(비교용 유지) |
| `@module-federation/node` | ⭕ | ❌ peer `webpack ^5.40` | — | ⭕ | ⭕ | ⭕ | 탈락(host 에 webpack 없음) |
| `@originjs/vite-plugin-federation` | ➖ | — | — | ❌ | — | ⭕ | Vite 전용, host 로는 못 씀 |
| `@module-federation/vite` | ➖ | — | — | ➖ | — | ⭕ | **remote 쪽에 채택** |
| single-spa | ⭕ | ⭕ | ⚠️ | ❌ | ⭕ | ⭕ | 오버헤드 큼, 라우팅 소유권 뺏김 |
| Native Federation (import maps) | ⭕ | ⚠️ | ⚠️ | ❌ | ⭕ | ⭕ | Angular 생태계 중심, React 예제 빈약 |
| iframe | ⭕ | ⭕ | ⭕ | ⭕ | ❌ | ❌ | 격리는 최고, UX 최악 |
| 모노레포 + 빌드타임 공유 | ⭕ | ⭕ | ⭕ | ⭕ | ⭕ | ❌ | 독립 배포 불가 → MFA 아님 |

채택안의 상세 구현: [../02-architecture/03-ssr-and-soft-nav.md](../02-architecture/03-ssr-and-soft-nav.md)

## 1. 런타임 전용 Module Federation ← 이 저장소의 핵심

**아이디어**: host 에 번들러 플러그인을 붙이지 않는다. host 는 그냥 `@module-federation/runtime`
라는 **일반 npm 라이브러리 하나**를 브라우저에서 쓴다.

```ts
import { init, loadRemote } from "@module-federation/runtime";

init({
  name: "host",
  remotes: [{ name: "catalog", entry: "http://localhost:3001/mf-manifest.json" }],
  shared: {
    react: { version: "19.2.8", lib: () => React, shareConfig: { singleton: true } },
  },
});

const mod = await loadRemote("catalog/ProductGrid");
```

Turbopack 입장에서는 그냥 동적 fetch 를 하는 클라이언트 코드일 뿐이다.
**번들러가 MF 를 몰라도 된다** — 이게 이 방식이 Next.js 16 에서 살아남는 이유다.

- 버전: `@module-federation/runtime` **2.8.2**
- host 쪽 제약: remote 는 `"use client"` 경계 안에서, 하이드레이션 이후에만 로드 가능
- remote 쪽 자유: Vite / Rsbuild / Rspack / webpack 무엇으로 빌드하든 상관없음

### 트레이드오프

이 상태(CSR only)에서 잃는 것:

| 잃는 것 | 설명 | 해소 여부 |
| --- | --- | --- |
| remote SSR | remote UI 가 초기 HTML 에 없다 | **해소** — node 타깃 번들 추가 빌드 |
| 초기 LCP | remote 청크 다운로드가 하이드레이션 이후 시작 | **해소** — 서버가 먼저 그림 |
| 서버 컴포넌트 | remote 는 100% 클라이언트 컴포넌트 | 미해소(원리적으로 불가) |

`@module-federation/node` 로 SSR 을 붙이는 게 정석이지만 peer 가 `webpack ^5.40` 이라
Turbopack host 에는 못 쓴다. 대신 필요한 최소 동작(HTTP fetch → React 주입 → 평가)만
직접 구현했다. → [../02-architecture/03-ssr-and-soft-nav.md](../02-architecture/03-ssr-and-soft-nav.md)

## 2. Multi-Zones (Next.js 공식 경로)

`next.config.ts` 의 `rewrites` 로 특정 경로 묶음을 다른 Next.js 배포본에 위임한다.
Vercel 은 `@vercel/microfrontends`(**2.4.0**) 로 이걸 제품화했고 App Router 를 지원한다.

```ts
// host
async rewrites() {
  return [{ source: "/checkout/:path*", destination: `${ZONE}/checkout/:path*` }];
}
```

```ts
// zone
export default { basePath: "/checkout", assetPrefix: "/checkout-static" };
```

- ⭕ Next.js 16 / Turbopack / App Router / RSC / SSR 전부 100% 그대로
- ❌ 런타임 코드 공유 없음. zone 경계를 넘으면 **하드 내비게이션이 강제된다**
- ❌ 상태 공유는 `localStorage` · 쿠키 · 서버 세션으로 직접 해결해야 함
- 적합: 경로 단위로 팀이 갈리고 **전환 UX 를 신경 쓰지 않는** 경우(사내 어드민 등)
- 부적합: 한 화면 안에 여러 팀 위젯이 섞이는 경우, **SPA 급 전환이 필요한 경우**

이 저장소는 소프트 내비게이션이 요구사항이라 **기각**했다.
실측: `/` → zone 이동 시 document 요청 1건 발생(하드), remote 이동은 0건(소프트).

## 3. `@module-federation/vite` 검토 결과

사용자가 찾은 라이브러리. 결론부터: **remote 빌드용으로는 좋고, host 로는 쓸 수 없다.**

```
$ npm view @module-federation/vite version peerDependencies
1.20.7
{ "vite": "^5.0.0 || ^6.0.0 || ^7.0.0 || ^8.0.0" }
```

- Vite 8 까지 지원. 활발히 유지보수 중(1.20.x 대)
- `federation()` named export 로 사용. `manifest: true` 를 주면 `mf-manifest.json` 을 내보낸다
- **Next.js 는 Vite 로 빌드되지 않으므로 host 에는 적용 불가**
- 하지만 remote 는 번들러가 자유롭다 → 이 저장소는 `remote-catalog` 를 이걸로 빌드했다

`@originjs/vite-plugin-federation` 과 비교: `@module-federation/vite` 는 module-federation
공식 조직이 관리하고 MF 2.x 런타임 · manifest · DTS 생성과 물려 있다. 신규 프로젝트라면
`@module-federation/vite` 를 고른다.

### 실제 빌드 산출물 (검증됨)

```
dist/mf-manifest.json
dist/remoteEntry.js
dist/assets/ProductGrid-*.js
dist/assets/ProductDetail-*.js
```

manifest 가 선언한 shared:
`react, react-dom, react-dom/client, react-dom/server, react/jsx-runtime, react/jsx-dev-runtime, react/compiler-runtime`

## 4. 왜 Rsbuild remote 도 같이 두었나

`remote-cart` 는 일부러 **Rsbuild(Rspack) + `@module-federation/rsbuild-plugin` 2.8.2** 로 빌드했다.
"번들러가 서로 달라도 런타임 계약만 맞으면 host 가 동일하게 소비한다"는 MF 의 핵심 주장을
이 저장소에서 실제로 검증하기 위함이다. → 검증 결과는 [04-experiments](../04-experiments/) 참고.

## 출처

- [Module Federation 공식 — Next.js 통합](https://module-federation.io/integrations/framework/nextjs/)
- [@module-federation/vite — npm](https://www.npmjs.com/package/@module-federation/vite)
- [Next.js Guides — Multi-zones](https://nextjs.org/docs/app/guides/multi-zones)
- [vercel-labs/microfrontends-nextjs-app-multi-zone (App Router 예제)](https://github.com/vercel-labs/microfrontends-nextjs-app-multi-zone)
- [Next.js 16 업그레이드 가이드](https://nextjs.org/docs/app/guides/upgrading/version-16)
