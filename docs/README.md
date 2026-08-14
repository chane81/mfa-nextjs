# mfa-nextjs 문서

Next.js 16 환경에서 마이크로 프론트엔드(MFA)를 구성하기 위한 리서치 · 설계 · 실험 기록.

## 문서 지도

| 폴더 | 내용 |
| --- | --- |
| [00-progress.md](./00-progress.md) | 작업 진행 기록 |
| [01-research](./01-research/) | `@module-federation/nextjs-mf` EOL 현황, 대체재 리서치, Vite MF 검토, **DTS 플러그인 검토** |
| [02-architecture](./02-architecture/) | 아키텍처 결정(ADR), 토폴로지, **SSR + 소프트 내비게이션 설계** |
| [03-setup](./03-setup/) | 모노레포 구조, 실행 방법, 버전 고정 근거 |
| [04-experiments](./04-experiments/) | 실험 A(런타임 MF) / 실험 B(Multi-Zones) 결과와 비교 |
| [05-troubleshooting](./05-troubleshooting/) | 구축 중 실제로 터진 문제와 해결책 |

## 4줄 요약

1. `@module-federation/nextjs-mf` 는 Next.js 16 을 지원하지 않는다(peer 가 `^15` 에서 끊김, Pages Router 전용, maintenance mode). 되살릴 방법은 없다.
2. host 는 **번들러 플러그인 없이** `@module-federation/runtime` 으로 remote 를 소비한다. Turbopack 은 MF 를 몰라도 된다.
3. **remote 는 SSR 된다.** remote 를 웹/노드 두 타깃으로 빌드하고, host 서버가 노드 번들을 가져와 자기 React 를 주입하며 실제 React 트리에 렌더한다.
4. **모든 경계 이동은 소프트 내비게이션이다.** 라우터를 host 하나로 두고 결제까지 remote 로 옮겼다. Multi-Zones 는 하드 내비게이션이 강제되어 탈락 — `/legacy-checkout` 에 비교용으로만 남겼다.

핵심 설계는 [02-architecture/03-ssr-and-soft-nav.md](./02-architecture/03-ssr-and-soft-nav.md) 에 있다.

## 검증 기준일

2026-08-14. 모든 버전 정보는 이 날짜의 npm registry 조회 결과다.
