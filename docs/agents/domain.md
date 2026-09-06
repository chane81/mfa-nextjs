# 도메인 문서

엔지니어링 스킬들이 코드베이스를 탐색할 때 이 저장소의 도메인 문서를 어떻게 읽어야 하는지.

이 저장소는 **단일 컨텍스트**다. `apps/*` · `packages/*` 로 나뉜 모노레포지만 검증 대상
도메인은 하나(Next 16 런타임 Module Federation + remote SSR)라서 컨텍스트를 쪼개지 않는다.

## 탐색 전에 읽을 것

- **루트 `CONTEXT.md`** — 있으면 읽는다.
- **`docs/02-architecture/01-decision.md`** — 이 저장소의 ADR 은 디렉터리가 아니라 이 파일
  하나에 누적된다. 건드릴 영역과 겹치는 ADR 을 먼저 읽는다.
  **`docs/adr/` 를 새로 만들지 않는다** — SSOT 를 둘로 쪼개지 않는다.
- 배경이 더 필요하면 루트 `CLAUDE.md` 의 문서 표를 따라간다
  (`docs/02-architecture/02-topology.md`, `docs/05-troubleshooting/01-known-issues.md` 등).

이 중 없는 파일이 있으면 **조용히 넘어간다**. 없다고 지적하지 말고, 미리 만들자고
제안하지도 않는다. `/domain-modeling` 스킬(`/grill-with-docs` · `/improve-codebase-architecture`
를 통해 도달)이 실제로 용어나 결정이 정리되는 시점에 lazily 만든다.

## 파일 배치

```
/
├── CONTEXT.md                              ← 아직 없음. 필요해지면 그때 만든다
├── docs/02-architecture/01-decision.md     ← ADR 이 여기 누적된다
├── apps/       (host · remote-catalog · remote-cart)
└── packages/   (contracts · remote-config · store · ui · *-config)
```

## 용어집의 어휘를 쓴다

출력이 도메인 개념을 이름으로 부를 때(이슈 제목, 리팩터링 제안, 가설, 테스트 이름)
`CONTEXT.md` 에 정의된 용어를 그대로 쓴다. 용어집이 일부러 피한 동의어로 흘러가지 않는다.

필요한 개념이 아직 용어집에 없으면 그게 신호다. 프로젝트가 쓰지 않는 말을 지어내고
있거나(다시 생각한다), 진짜 빈칸이거나(`/domain-modeling` 용으로 적어둔다) 둘 중 하나다.

## ADR 과 충돌하면 드러낸다

출력이 기존 ADR 과 어긋나면 조용히 덮어쓰지 말고 명시적으로 꺼낸다.

> _ADR-0007(런타임 MF 를 번들러 플러그인 없이 간다)과 어긋난다. 그래도 다시 열어볼 만한 이유는…_
