# mfa-nextjs 문서

Next.js 16 환경에서 마이크로 프론트엔드(MFA)를 구성하기 위한 리서치 · 설계 · 실험 기록.

## 문서 지도

| 폴더                                        | 내용                                                                                                      |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| [anatomy.html](./anatomy.html)              | **전체 구조 해부도** — 배포 파이프라인과 host↔remote 런타임을 그림으로. 브라우저로 연다                  |
| [00-progress.md](./00-progress.md)          | 작업 진행 기록                                                                                            |
| [01-research](./01-research/)               | `@module-federation/nextjs-mf` EOL 현황, 대체재 리서치, Vite MF 검토, **DTS 플러그인 검토**               |
| [02-architecture](./02-architecture/)       | 아키텍처 결정(ADR), 토폴로지, SSR + 소프트 내비게이션 설계, **remote 수명주기(버전·캐시·신뢰)**, 스타일링 |
| [03-setup](./03-setup/)                     | 실행 방법, 버전 고정 근거(Node·pnpm·TS), **환경변수**, Dokploy 컨테이너 배포                              |
| [04-experiments](./04-experiments/)         | 실험 A(런타임 MF) / B(Multi-Zones·기각) / **C(ISR·Cache Components)** 결과와 비교                         |
| [05-troubleshooting](./05-troubleshooting/) | 구축 중 실제로 터진 문제와 해결책                                                                         |
| [06-testing](./06-testing/)                 | **테스트 계획과 진척도** — 무엇을 왜 테스트하는가, 러너 구조, 테스트를 쓸 때의 함정                       |

## 6줄 요약

1. `@module-federation/nextjs-mf` 는 Next.js 16 을 지원하지 않는다(peer 가 `^15` 에서 끊김, Pages Router 전용, maintenance mode). 되살릴 방법은 없다.
2. host 는 **번들러 플러그인 없이** `@module-federation/runtime` 으로 remote 를 소비한다. Turbopack 은 MF 를 몰라도 된다.
3. **remote 는 SSR 된다.** remote 를 웹/노드 두 타깃으로 빌드하고, host 서버가 노드 번들을 가져와 자기 React 를 주입하며 실제 React 트리에 렌더한다.
4. **모든 경계 이동은 소프트 내비게이션이다.** 라우터를 host 하나로 두고 결제까지 remote 로 옮겼다. Multi-Zones 는 하드 내비게이션이 강제되어 탈락했다. 대조군으로 남겨뒀던 zone 앱도 이후 삭제했다(6차).
5. **Next 16 의 캐시 기능을 그대로 쓴다.** ISR 등가(`"use cache"` + `cacheLife`)와 태그 무효화가
   런타임 MF 위에서 동작한다 — 캐시된 HTML 에 remote 마크업이 들어가고, 캐시 HIT 구간에는
   remote 번들을 아예 건드리지 않는다. Next 16 은 `dynamic`/`revalidate` 세그먼트 설정을
   버렸으므로 host 전체를 `cacheComponents: true` 로 이행했다.
6. **remote 배포는 버전 공표로 수렴한다.** remote 가 `mf-version.json` 으로 버전을 알리고
   자산을 `/v<version>/` 불변 경로에 올린다. host 인스턴스가 여러 개여도 브로드캐스트 없이
   따라오고, 롤백은 그 파일 하나 되돌리면 된다. host 서버가 남의 코드를 실행하므로
   오리진 허용 목록 · SRI · Ed25519 서명으로 막는다.

핵심 설계 두 편:

- 그림으로 먼저 보려면 — [anatomy.html](./anatomy.html) (GitHub 화면은 HTML 을 렌더링하지 않는다. 받아서 브라우저로 연다)
- 렌더링 — [02-architecture/03-ssr-and-soft-nav.md](./02-architecture/03-ssr-and-soft-nav.md)
- 배포·캐시·신뢰 — [02-architecture/04-remote-lifecycle.md](./02-architecture/04-remote-lifecycle.md)
- 스타일링 — [02-architecture/05-styling.md](./02-architecture/05-styling.md)
- host 의 `src/mf` 배치 — [02-architecture/06-host-mf-layout.md](./02-architecture/06-host-mf-layout.md)

## 지금 상태

- 로컬 · 컨테이너 · Dokploy(<https://mfa.lakegreen.net>) 세 곳에서 돈다.
- 앱 3개(host / catalog / cart)가 각자 이미지로 배포된다. remote 만 재배포하는 경로가 열려 있다.
- CI 가 `lint` · `typecheck` · `format:check` 와 **전체 빌드**를 검증한다.
  host 빌드는 프리렌더가 remote SSR 번들을 실제로 받아 실행하므로, 빌드 통과 자체가
  "Next 16 에서 런타임 MF + SSR 이 된다"는 이 저장소의 주장에 대한 계약 테스트다.
- 스타일은 **Tailwind v4** 다. 토큰은 `@mfa/tailwind-config` 한 곳에 두고 각 앱이
  자기 파이프라인에서 컴파일하며, remote 는 자기 CSS 를 `<link precedence>` 로 직접
  선언한다 ([02-architecture/05-styling.md](./02-architecture/05-styling.md)).
- 남은 것은 [00-progress.md](./00-progress.md) 의 "다음에 해볼 것".

## 검증 기준일

- 리서치·버전 조사: 2026-08-14 ~ 15 (npm registry 직접 조회)
- 구조·실행·배포 기록: 2026-08-19 기준으로 갱신됨
