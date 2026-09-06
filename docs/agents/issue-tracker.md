# 이슈 트래커: GitHub

이 저장소의 이슈와 스펙은 GitHub 이슈로 존재한다(`chane81/mfa-nextjs`).
모든 조작은 `gh` CLI 로 한다.

## 규약

- **이슈 생성**: `gh issue create --title "..." --body "..."`. 본문이 여러 줄이면 heredoc 을 쓴다.
- **이슈 읽기**: `gh issue view <number> --comments`. 댓글은 `jq` 로 걸러 읽고 라벨도 같이 가져온다.
- **이슈 목록**: `gh issue list --state open --json number,title,body,labels,comments --jq '[.[] | {number, title, body, labels: [.labels[].name], comments: [.comments[].body]}]'`.
  필요하면 `--label` · `--state` 로 좁힌다.
- **댓글**: `gh issue comment <number> --body "..."`
- **라벨 추가 · 제거**: `gh issue edit <number> --add-label "..."` / `--remove-label "..."`
- **닫기**: `gh issue close <number> --comment "..."`

저장소는 `git remote -v` 에서 추론한다. 클론 안에서 실행하면 `gh` 가 알아서 잡는다.

## 요청 창구로서의 PR

**PR 을 요청 창구로 쓰는가: no.** _(외부 PR 을 기능 요청으로 취급하려면 `yes` 로 바꾼다. `/triage` 가 이 플래그를 읽는다.)_

`yes` 로 두면 PR 도 이슈와 같은 라벨 · 상태를 타고, 명령만 `gh pr` 짝으로 바뀐다.

- **PR 읽기**: `gh pr view <number> --comments`, diff 는 `gh pr diff <number>`.
- **트리아지 대상 외부 PR 목록**: `gh pr list --state open --json number,title,body,labels,author,authorAssociation,comments`
  로 받아 `authorAssociation` 이 `CONTRIBUTOR` · `FIRST_TIME_CONTRIBUTOR` · `NONE` 인 것만 남긴다
  (`OWNER` · `MEMBER` · `COLLABORATOR` 는 버린다).
- **댓글 · 라벨 · 닫기**: `gh pr comment`, `gh pr edit --add-label`/`--remove-label`, `gh pr close`.

GitHub 는 이슈와 PR 이 번호 공간을 공유한다. 그래서 맨 `#42` 는 둘 중 무엇이든 될 수 있다 —
`gh pr view 42` 로 먼저 확인하고 안 되면 `gh issue view 42` 로 넘어간다.

## 스킬이 "이슈 트래커에 올려라" 라고 할 때

GitHub 이슈를 만든다.

## 스킬이 "해당 티켓을 가져와라" 라고 할 때

`gh issue view <number> --comments` 를 돌린다.

## Wayfinding 조작

`/wayfinder` 가 쓴다. **맵**은 이슈 하나이고, 티켓은 그 **자식** 이슈다.

- **맵**: `wayfinder:map` 라벨이 붙은 이슈 하나. 본문에 Notes · Decisions-so-far · Fog 를 담는다.
  `gh issue create --label wayfinder:map`.
- **자식 티켓**: 맵에 GitHub sub-issue 로 연결된 이슈(sub-issues 엔드포인트에 `gh api`).
  sub-issues 가 안 켜져 있으면 맵 본문의 task list 에 자식을 넣고, 자식 본문 맨 위에
  `Part of #<map>` 을 적는다. 라벨은 `wayfinder:<type>`(`research`/`prototype`/`grilling`/`task`).
  누가 잡으면 그 사람에게 assign 한다.
- **블로킹**: GitHub **네이티브 issue dependencies** 가 정본이다(UI 에 보인다).
  간선 추가는 `gh api --method POST repos/<owner>/<repo>/issues/<child>/dependencies/blocked_by -F issue_id=<blocker-db-id>`.
  여기서 `<blocker-db-id>` 는 블로커의 숫자 **database id** 다
  (`gh api repos/<owner>/<repo>/issues/<n> --jq .id` — `#number` 도 `node_id` 도 아니다).
  GitHub 는 `issue_dependencies_summary.blocked_by` 로 열린 블로커 수만 보고한다(그게 실제 게이트다).
  dependencies 를 못 쓰면 자식 본문 맨 위 `Blocked by: #<n>, #<n>` 줄로 대신한다.
  블로커가 전부 닫히면 티켓이 풀린다.
- **프론티어 질의**: 맵의 열린 자식들을 나열하고(`gh issue list --state open`, 맵의 sub-issues · task list 로 한정),
  열린 블로커가 있는 것(`issue_dependencies_summary.blocked_by > 0`, 또는 `Blocked by` 줄에 열린 이슈)과
  assignee 가 있는 것을 뺀다. 맵 순서상 첫 번째가 이긴다.
- **claim**: `gh issue edit <n> --add-assignee @me`. 그 세션의 첫 쓰기다.
- **resolve**: `gh issue comment <n> --body "<answer>"` → `gh issue close <n>` →
  맵의 Decisions-so-far 에 컨텍스트 포인터(gist + 링크)를 덧붙인다.
