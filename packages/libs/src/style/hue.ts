import type { CSSProperties } from 'react';

/**
 * remote · 실험 모드마다 다른 경계 색을 넘기는 통로.
 *
 * 색 자체는 `@mfa/tailwind-config` 의 `theme.css` 가 정한다 — `remote-boundary` ·
 * `text-origin` 같은 `@utility` 가 `hsl(var(--hue) …)` 로 읽는다. 그런데 hue 값은
 * **런타임 값**이라(`ORIGIN_HUE`, `LAB_MODES[mode].hue`) 클래스로 굳힐 수 없다.
 * 그래서 CSS 변수로 내려보내고, 그 변수 이름이 양쪽의 계약이 된다.
 *
 * ## 왜 함수로 감싸나
 *
 * 감추는 건 이 세 줄이 아니라 **`--hue` 라는 이름과 `as CSSProperties` 캐스팅**이다.
 * (React 의 `CSSProperties` 는 커스텀 속성을 모른다 — 캐스팅 없이는 타입이 거부한다.)
 *
 * 한동안 이게 `@mfa/ui` 안의 비공개 함수였다. 그러자 `Panel`·`Badge` 로 감쌀 수 없는
 * 자리 셋(pill 모양 배지, lab 카드 둘)이 리터럴을 그대로 베껴 갔다. 그 상태에서 변수
 * 이름을 바꾸면 `@mfa/ui` 의 컴포넌트는 따라오고 **베껴 간 쪽만 색을 잃는다** — 타입
 * 오류도 테스트 실패도 없이 화면에서만 나타난다. 이 저장소에서 hue 는 "어느 remote 가
 * 그렸나" 를 판별하는 관측 수단이라, 관측 장치가 조용히 거짓말을 하게 된다.
 *
 * ## 왜 `@mfa/ui` 가 아니라 여기인가
 *
 * `@mfa/ui` 는 **컴포넌트**를 내보내는 패키지다. 이 함수는 컴포넌트가 아니고, 실제로
 * 소비처 셋 중 둘은 `@mfa/ui` 의 컴포넌트를 쓰지 않으면서 이 값만 필요하다.
 * 그 자리에 두면 "프리미티브를 안 쓰는데 프리미티브 패키지를 의존한다" 가 된다.
 */
export function hueVar(hue: number): CSSProperties {
  return { '--hue': hue } as CSSProperties;
}
