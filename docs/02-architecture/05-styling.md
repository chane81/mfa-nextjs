# 스타일링 — MFA 에서 Tailwind CSS 를 어떻게 나눠 갖나

세 앱이 서로 다른 번들러를 쓰고(Next 16/Turbopack · Vite 8 · Rsbuild 2) 각자 독립
배포된다. 그 위에서 하나의 디자인 시스템을 쓰려면 두 가지를 정해야 한다.

1. **CSS 를 누가 컴파일하나** — 이 문서
2. **remote 의 CSS 가 host 페이지에 어떻게 도달하나** —
   [02-topology.md](./02-topology.md#remote-의-css-는-어떻게-따라오나) 에 계약이 있다

## 이전 상태 — 인라인 스타일이었고, 그건 의도였다

원래 `packages/ui/src/tokens.ts` 가 색·간격·폰트를 JS 객체로 들고 있었고 모든 컴포넌트가
`style={{ ... }}` 로 그렸다. 그 파일 주석이 이유를 이렇게 적어 뒀었다.

> CSS 파이프라인 차이를 피하려고 인라인 스타일 값으로 배포한다.

회피였다. CSS 를 쓰는 순간 위의 두 문제를 풀어야 하는데 세 번들러가 제각각이라 비용이
컸다. 지금은 셋 모두 Tailwind v4 공식 연동을 갖고 있고, 전달 문제는 React 19 의
`<link precedence>` 가 푼다. 회피할 이유가 없어졌다.

## 공유 패키지가 CSS 를 빌드하면 안 된다

Turborepo 의 일반적인 Tailwind 가이드는 공유 UI 패키지가 자기 CSS 를 빌드해
(`tailwindcss -i ./src/styles.css -o ./dist/index.css`) 앱이 그 산출물을 import 한다.

**여기서는 못 쓴다.** 그러면 `@mfa/ui` 의 CSS 가 새 배포 단위가 되고, 앱이 새 클래스를
쓸 때마다 그걸 먼저 배포해야 한다. 배포 그래프가 다시 하나로 묶인다 — 이 저장소가
증명하려는 독립 배포와 정면으로 어긋난다.

그래서 **`@mfa/tailwind-config` 는 CSS 소스만 배포하고 각 앱이 자기 파이프라인에서
컴파일한다.** `packages/ui` 는 클래스 이름만 내보내고 CSS 를 만들지 않는다.

| 앱      | 연동                                          | CSS 진입점                     |
| ------- | --------------------------------------------- | ------------------------------ |
| host    | `postcss.config.mjs` → `@tailwindcss/postcss` | `src/app/globals.css`          |
| catalog | `@tailwindcss/vite` 플러그인                  | `src/styles.css` (`main.tsx`)  |
| cart    | `postcss.config.mjs` → `@tailwindcss/postcss` | `src/styles.css` (`index.tsx`) |

PostCSS 설정 자체는 `@mfa/tailwind-config/postcss` 를 재-export 한다. 값은 세 줄이지만
**Tailwind 를 어느 플러그인으로 무는지가 버전마다 바뀌는 지점**이라(v3 은 `tailwindcss`
직접, v4 는 `@tailwindcss/postcss`) 한 곳에 둔다.

### 중복은 문제가 되지 않는다

같은 유틸리티가 세 CSS 에 들어가고, remote CSS 는 host 페이지에 함께 로드된다. 그래도
값이 같아 부작용이 없다. CSS 캐스케이드 레이어(`theme`/`base`/`components`/`utilities`)는
이름이 같으면 병합되고 순서는 **첫 선언**을 따르므로, 나중에 로드된 remote 의 preflight 가
host 의 유틸리티를 덮지 않는다.

### `@source` 가 없으면 조용히 깨진다

Tailwind v4 의 자동 소스 탐지는 `node_modules` 를 훑지 않는다. `@mfa/ui` 는 pnpm
워크스페이스 링크라 앱 입장에서 `node_modules` 안에 있고, 지정하지 않으면 그 패키지의
클래스가 **CSS 에서 빠진다 — 빌드는 성공하고 화면만 무너진다.**

`packages/tailwind-config/theme.css` 가 `@source '../ui/src'` 로 한 번 지정해 세 앱에
모두 적용한다(경로는 그 CSS 파일 위치 기준). 앱 쪽 진입 CSS 는 자기 소스만
(`@source '.'` / `@source '../'`) 추가한다 — 자동 탐지의 기준점이 워크스페이스 링크 안의
`theme.css` 라서 앱 소스가 자동으로는 잡히지 않기 때문이다.

## 토큰이 어디로 갔나

`tokens.ts` 는 삭제됐고 값은 `theme.css` 의 `@theme` 로 옮겼다. 이름이 둘 바뀌었다.

| 이전                     | 지금            | 이유                        |
| ------------------------ | --------------- | --------------------------- |
| `tokens.color.textMuted` | `--color-muted` | `text-text-muted` 를 피한다 |
| `tokens.color.border`    | `--color-line`  | `border-border` 를 피한다   |

간격은 손대지 않았다. 옛 `tokens.space(n) = n * 4px` 와 Tailwind 기본
`--spacing: 0.25rem`(=4px)이 이미 같은 눈금이라 `space(5)` 가 그대로 `p-5` 다.
모서리(`--radius-sm/md/lg`)는 기본 스케일을 디자인 값(6/10/16px)으로 덮어썼다 —
값이 두 벌 존재하는 것보다 기본을 옮기는 쪽이 SSOT 에 맞다.

### 런타임 값 하나만 인라인 스타일로 남았다

remote 경계 색(`originHue`)은 컴포넌트가 인자로 받는 숫자라 클래스로 굳힐 수 없다.
CSS 변수로 내려보내고 유틸리티가 그 변수를 읽는다.

```tsx
<section style={{ '--hue': originHue } as CSSProperties} className="remote-boundary …">
```

```css
/* theme.css */
@utility remote-boundary {
  border: 1px dashed hsl(var(--hue) 70% 62% / 0.5);
}
```

`text-origin` · `border-origin` · `bg-origin-soft` 도 같은 통로다. 그 `hsl(...)` 조립식이
컴포넌트마다 복제되지 않게 유틸리티로 묶었다.

### ⚠️ 클래스 이름을 문자열로 조립하지 않는다

`bg-${variant}` 처럼 만들면 Tailwind 의 소스 스캔이 못 찾아 CSS 에서 빠진다.
`packages/ui` 의 `Button` 은 variant 별 클래스를 **완성된 문자열**로 나열한다.

## 실측

`pnpm build` 후 host 의 프리렌더 HTML(`.next/server/app/index.html`):

```
stylesheet link 3개 — 전부 <head> 안
  /_next/static/chunks/….css           precedence=next
  http://localhost:3001/v…/style.css   precedence=mfa-remote
  http://localhost:3002/v…/style.css   precedence=mfa-remote
```

`index.html` 은 cart 의 expose 를 둘(`CartBadge` 헤더 배지, `CartPanel`) 렌더하는데
cart 의 `<link>` 는 하나만 남았다 — React 19 의 중복 제거가 실제로 동작한다.

페이지마다 **실제로 쓰는 remote 의 CSS 만** 실린다. `/debug` 와 `/cart` 는 catalog 를
그리지 않으므로 cart 의 `<link>` 하나뿐이다(헤더 배지가 cart remote 다).

`pnpm dev` 에서는 버전 없는 경로(`http://localhost:3001/style.css`)가 나오고, 두 remote
모두 `Content-Type: text/css` + `Access-Control-Allow-Origin: *` 로 응답한다. catalog 는
그 응답을 위해 dev 전용 미들웨어가 필요하다 — 이유는
[02-topology.md](./02-topology.md#remote-의-css-는-어떻게-따라오나) 의 제약 표에 있다.

`<link>` 를 거는 주체는 host 다(`RemoteComponent`). 한때 remote 의 expose 마다 선언하게
했다가 옮겼다 — 근거는 같은 문서의 "왜 remote 쪽이 아니라 host 쪽인가".

검증일: 2026-08-19 · Tailwind CSS 4.3.3
