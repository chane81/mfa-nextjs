# 브랜치 상태 — `chore/drop-moment` (base: `main`)

저장소: 사내 어드민 프론트엔드 (React 19 / Vite 6 / TypeScript). 본문 언어는 한글.

## `git log --oneline main..HEAD`

```
7ac0192 chore: moment 를 의존성에서 뺀다
d55e83f refactor(date): 남은 moment 호출을 date-fns 로 옮긴다
b1f7ca4 refactor(date): 포맷 문자열을 한 곳으로 모은다
e903d1a feat(date): formatDate · parseDate 어댑터를 만든다
44c6e2b test(date): 타임존 경계를 고정한 테스트를 붙인다
```

## `git diff main...HEAD --stat` (요약)

```
 package.json                              |    2 +-
 pnpm-lock.yaml                            |  412 +++-----
 src/lib/date/index.ts                     |   68 ++
 src/lib/date/formats.ts                   |   41 +
 src/lib/date/index.test.ts                |  156 +++
 src/features/orders/OrderTable.tsx        |   14 +-
 src/features/orders/OrderDetail.tsx       |    9 +-
 src/features/orders/filters.ts            |   22 +-
 src/features/billing/InvoiceRow.tsx       |    7 +-
 src/features/billing/Statement.tsx        |   11 +-
 ... (같은 형태로 26개 파일 더) ...
 src/shared/DateRangePicker.tsx            |   31 +-
 vite.config.ts                            |    4 -
 41 files changed, 588 insertions(+), 731 deletions(-)
```

## 핵심 변경

### `src/lib/date/index.ts` (신규) — 어댑터

```ts
export function formatDate(value: DateInput, preset: FormatPreset): string;
export function parseDate(text: string, preset: FormatPreset): Date | null;
```

호출부는 `date-fns` 를 직접 import 하지 않는다. 라이브러리를 또 갈아탈 때 고칠 곳이
이 파일 하나가 되도록.

### `src/lib/date/formats.ts` (신규)

포맷 문자열이 34곳에 흩어져 있었다. `'YYYY-MM-DD'` 와 `'YYYY-MM-DD '` (뒤 공백),
`'YYYY.MM.DD'` 가 같은 화면에 섞여 있던 자리도 있었다. 프리셋 9개로 모았다.

### moment → date-fns 치환 (파일 33개)

대부분 기계적이다.

```diff
- moment(order.createdAt).format('YYYY-MM-DD HH:mm')
+ formatDate(order.createdAt, 'dateTime')
```

### `src/shared/DateRangePicker.tsx`

기계적이지 않은 유일한 파일. moment 의 `startOf('day')` 가 **로컬 타임존** 기준인데
date-fns 의 `startOfDay` 도 같지만, 기존 코드가 그 값을 `.toISOString()` 으로 서버에
보내고 있었다. UTC 로 바뀌면서 KST 오전 9시 이전 주문이 전날로 잡히던 버그가 있었다.
이번에 같이 고쳤다 — `formatDate(d, 'apiDate')` 가 로컬 기준으로 직렬화한다.

## 배경

- 번들에서 moment 가 gzip 231KB 였다. 로케일 파일이 전부 딸려온다.
- 교체 후 초기 번들 1.84MB → 1.61MB (gzip 기준 measured).
- `dayjs` 도 후보였다. moment 와 API 가 거의 같아서 치환이 싸지만, 그러면 어댑터를 안
  만들게 되고 다음 교체 때 또 34곳을 고치게 된다. 어댑터를 만드는 게 목적의 절반이었다.
- 타임존 테스트는 `TZ=Asia/Seoul` 과 `TZ=UTC` 두 벌로 돌린다. 안 그러면 CI(UTC)에서만
  통과하는 테스트가 생긴다 — 실제로 처음에 그렇게 짰다가 로컬에서 깨졌다.

## 검증

`pnpm test` 431개 통과(TZ 두 벌) · `pnpm typecheck` · `pnpm build` 통과.
`grep -r "from 'moment'" src/` 결과 0건.
