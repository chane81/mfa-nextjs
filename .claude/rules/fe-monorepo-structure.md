---
paths:
  - 'apps/**'
  - 'packages/**'
---

# 폴더 구조 규칙 — 콜로케이션

파일·폴더를 새로 만들거나 옮길 때 이 규칙을 따른다.
출처: [chane81/fe-monorepo-architecture](https://github.com/chane81/fe-monorepo-architecture/blob/main/.claude/rules/fe-monorepo-structure.md).
이 저장소에 맞춰 달라지는 부분은 마지막 절에 모아 둔다 — 그쪽이 우선한다.

## 1. 다섯 이름을 모든 깊이에서 반복한다

```
components/  hooks/  libs/  constants/  apis/
```

앱이든 라우트든 컴포넌트 내부든 **같은 뜻**이다. 다른 이름을 새로 만들지 않는다 —
`utils` · `helpers` · `services` · `common` 금지.

## 2. 쓰는 곳 가장 가까이에 둔다

처음부터 위로 올리지 않는다. 공유 범위가 넓어지면 **가장 가까운 공통 부모로 승격**한다.

```
컴포넌트 내부  →  라우트 `_src/`  →  앱 `src/`  →  `packages/*`
```

| 쓰는 범위             | 어디에                                 |
| --------------------- | -------------------------------------- |
| 컴포넌트 하나         | `<Component>/{hooks,libs,constants}/`  |
| 라우트 하나(와 하위)  | `app/<route>/_src/{components,libs,…}` |
| 같은 앱의 여러 라우트 | `src/{components,libs,…}`              |
| 2개 이상 앱           | `packages/*`                           |

`_src/` 는 밑줄로 시작해 **Next 라우팅에서 빠진다**(근거: Next 16.4 공식 문서
`app/getting-started/project-structure` 의 "Private folders" — 폴더와 그 하위 전체가
라우팅 대상에서 제외된다).

## 3. 층을 넘을 때는 "코드의 주인"을 먼저 본다

도메인 로직은 소비자가 한 곳뿐이어도 그 도메인에 둔다. "쓰는 곳 가까이" 는 **같은 층
안에서만** 적용한다. 이 저장소에서 그 도메인은 `apps/host/src/mf`(런타임 MF)와
`packages/{contracts,remote-config,store}` 다.

## 4. 이름 규칙

- 컴포넌트 폴더: `PascalCase/` + `PascalCase.tsx` + `index.ts`(공개 진입점)
- 하위 조각도 같은 모양이다. 파일이 하나뿐이어도 폴더를 준다 — 승격 시점을 매번
  판단하지 않기 위해서다
- 훅: `useXxx.ts` / 이 저장소의 패키지 안에서는 기존 `use-xxx.ts` 를 유지한다(5절)
- 테스트는 대상 옆에(`Foo.tsx` → `Foo.test.tsx`). 환경은 확장자로 갈린다 —
  `.test.ts` = node, `.test.tsx` = jsdom

## 5. 경계와 import

- 폴더 밖에서는 **`index.ts` 로만** import 한다. 남의 폴더 내부(`X/libs/...`)를 직접
  가리키지 않는다
- 부모 라우트의 `_src` 는 하위 라우트가 가져다 써도 된다. 그 반대는 금지
- 라우트 안에서는 상대경로, 라우트 밖으로 나갈 때는 `@/` alias

## 6. 애매하면 묻는다

규칙으로 안 떨어지는 배치는 임의로 정하지 않는다. 선택지와 각각의 근거(쓰는 범위,
코드의 주인)를 제시해 사용자에게 묻는다.

---

## 이 저장소에서 달라지는 것

원본은 "여러 앱 + 도메인 패키지" 모노레포를 전제한다. 여기는 **런타임 MF 검증
저장소**라 세 자리가 다르다.

### `app/_src/` 는 만들지 않는다

모든 라우트가 `app/` 의 자식이라, 루트 라우트 전용 코드는 앱 전역과 **구별되지
않는다**(5절대로면 모든 하위 라우트가 `app/_src` 를 쓸 수 있다). 이름이 둘인데 뜻이
하나가 되므로, 루트 라우트(`app/page.tsx`)만 쓰는 코드도 `src/` 에 둔다.

### `mf/` 의 레이어 이름은 그대로 둔다

`apps/host/src/mf` 는 컴포넌트 묶음이 아니라 **의존 방향이 고정된 레이어**다
(`components/` → `loader/` → `versions/` → `trust/` → `config/`, 배경:
`docs/02-architecture/06-host-mf-layout.md`). `loader` · `versions` · `trust` ·
`state` 를 `libs/` 로 뭉개면 그 방향을 읽을 수 없다. 3절의 "코드의 주인" 이 이 경우다.

폴더 안쪽에는 다섯 이름을 적용한다 — `mf/components/RemoteComponent/components/` ·
`.../libs/` 처럼.

⚠️ `mf/components/*/libs/` 로 파일을 내릴 때 **`'use client'` 를 같이 옮긴다.**
디렉티브는 파일 단위이고 배럴은 경계를 전달하지 않는다(known-issues P-1).

### remote 의 `exposes/` 는 평면을 유지한다

`apps/remote-*/src/exposes/*.tsx` 는 MF 빌드 설정이 직접 가리키는 **계약 경계**다
(`@mfa/contracts` 의 모듈 이름과 1:1). 폴더로 감싸면 노출 경로가 바뀌어 host 의
`loadRemote()` 키와 어긋난다. 컴포넌트 폴더 규칙은 `exposes/` 를 제외한 나머지에만
적용한다.

### `packages/` 는 `shared / domains / widgets` 로 나누지 않는다

원본의 그 삼분법은 여러 앱이 도메인을 공유하는 전제에서 나온다. 여기서 "여러 도메인
조합 + 2개 이상 앱" 자리는 **런타임 remote 자체**(`apps/remote-*`)가 맡는다 — 그게 이
저장소가 검증하는 대상이다. 그래서 현재 평면 배치를 유지한다.

| 원본                         | 이 저장소                                        |
| ---------------------------- | ------------------------------------------------ |
| `packages/shared/components` | `packages/ui`                                    |
| `packages/shared/libs`       | `packages/utils`                                 |
| `packages/domains/<domain>`  | `packages/store` · `contracts` · `remote-config` |
| `packages/widgets`           | `apps/remote-*` (런타임 MF)                      |
| `packages/config`            | `typescript-config` · `tailwind-config`          |
