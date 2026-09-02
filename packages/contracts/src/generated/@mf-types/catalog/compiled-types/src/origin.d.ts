/**
 * 이 remote 가 자기를 표시하는 방식. **한 곳에서만 정한다.**
 *
 * 근거는 cart 쪽 `src/origin.tsx` 와 같다 — `origin` 라벨과 `originHue` 는 "이 UI 를
 * 어느 앱이 그렸나"를 화면에서 판별하는 관측 수단이고, expose 마다 리터럴을 복사하면
 * 하나만 어긋나도 그 컴포넌트가 다른 remote 인 것처럼 보인다.
 */
export declare const ORIGIN: {
    readonly origin: "remote: catalog · vite";
    readonly originHue: 280;
};
/** `<Badge>` 등 Panel 밖에서 같은 색을 쓸 때 */
export declare const ORIGIN_HUE: 280;
