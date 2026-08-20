---
paths:
  - 'packages/tailwind-config/**'
  - 'packages/ui/**'
  - '**/*.css'
  - '**/postcss.config.mjs'
---

# 스타일링 규칙 (Tailwind v4)

토큰 원본은 `packages/tailwind-config/theme.css` 의 `@theme` 한 곳뿐이다.
**공유 패키지는 CSS 를 빌드하지 않는다** — 소스만 배포하고 세 앱이 자기 파이프라인에서 컴파일한다
(host · cart 는 `@tailwindcss/postcss`, catalog 는 `@tailwindcss/vite`).
공유 CSS 산출물을 만들면 배포 그래프가 다시 하나로 묶여 독립 배포 주장이 깨진다.

세 앱과 `@mfa/tailwind-config` 의 Tailwind 버전은 **같아야 한다**(현재 `^4.3.3`).

## 조용히 깨지는 셋 — 전부 에러가 안 난다

1. **`@source` 누락** — v4 자동 탐지는 `node_modules` 를 안 훑는다. `@mfa/ui` 는 워크스페이스
   링크라 거기 있다. `theme.css` 가 `@source '../ui/src'` 로 한 번 잡고, 앱 진입 CSS 는 자기 소스를
   따로 지정한다(`@source '.'` / `@source '../'`).
2. **클래스 이름 조립** — `bg-${variant}` 는 소스 스캔이 못 찾는다. variant 별로 **완성된 문자열**을
   나열한다(`packages/ui` 의 `Button` 참고).
3. **CSS 파일명 · 위치 변경** — host 가 주소를 계산으로 만든다. 계약은 `MF_FILES.styles` 다.

## remote 의 CSS 는 host 가 `<link>` 로 건다

`RemoteComponent` 한 곳에서 `<link rel="stylesheet" precedence="mfa-remote">` 를 건다.
remote 쪽 expose 마다 선언하지 않는다 — expose 를 추가할 때 잊으면 스타일 없는 화면이 조용히 나온다.
주소는 `REMOTE_ORIGINS[remote] + stylesPath(version)` 로 만든다(브라우저에서도 맞는 값).

## CSS 파일에는 **유틸리티로 못 적는 것**만 둔다

전환·애니메이션도 마찬가지다. 크기 전환(`grid-rows-[0fr]` → `data-[open=true]:grid-rows-[1fr]`),
흐림(`blur-xs`), 자식 지정(`*:overflow-hidden`), 움직임 줄이기(`motion-reduce:`)는 전부
유틸리티로 적힌다 — CSS 로 내려보내면 그 규칙이 마크업에서 안 보이게 된다.

정말 못 적는 건 **키프레임**뿐이다. 그건 `@theme` 안에 `--animate-*` 와 `@keyframes` 로
등록해 `animate-<이름>` 유틸리티가 생기게 한다(v4 규약). 곡선처럼 여러 자리가 공유하는 값은
`--ease-*` 토큰으로 `theme.css` 에 둔다 — 같은 곡선을 타야 하나의 동작으로 읽힌다.

긴 유틸리티 조합이 여러 곳에 복제될 것 같으면 CSS 클래스가 아니라 **컴포넌트**로 묶는다
(`apps/remote-cart/src/components/Reveal.tsx`).

## 인라인 스타일은 런타임 값만

`tokens.ts` 는 삭제됐다. 클래스로 굳힐 수 없는 런타임 값(remote 경계 색 `--hue`)만 CSS 변수로
내려보내고, `remote-boundary` · `text-origin` 같은 `@utility` 가 그 변수를 읽는다.
`hsl(...)` 조립식을 컴포넌트에 복제하지 않는다.

배경과 실측은 `docs/02-architecture/05-styling.md`.
