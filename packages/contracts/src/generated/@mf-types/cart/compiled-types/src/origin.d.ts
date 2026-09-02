/**
 * 이 remote 가 자기를 표시하는 방식. **한 곳에서만 정한다.**
 *
 * `origin` 라벨과 `originHue` 는 "이 UI 를 어느 앱이 그렸나"를 화면에서 즉시 판별하려는
 * 장치다(MFA 실험의 관측 수단이다). expose 세 개가 같은 리터럴 쌍을 각자 적고 있었고,
 * 하나만 다르게 적히면 그 컴포넌트만 다른 remote 인 것처럼 보인다 — 관측 수단이
 * 거짓말을 하면 없는 문제를 쫓게 된다.
 *
 * hue 150(초록)은 catalog 의 280(보라)과 짝이다. 값 자체의 근거는
 * `packages/tailwind-config/theme.css` 의 `--hue` 유틸리티.
 */
export declare const ORIGIN: {
    readonly origin: "remote: cart · rsbuild";
    readonly originHue: 150;
};
/** `<Badge>` 등 Panel 밖에서 같은 색을 쓸 때 */
export declare const ORIGIN_HUE: 150;
