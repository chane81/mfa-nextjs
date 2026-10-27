/**
 * host / remote 가 공유하는 프리미티브. 컴포넌트마다 폴더 하나다 — `<이름>/<이름>.tsx` 가 본체,
 * 같은 폴더의 `index.ts` 가 그걸 재수출하고 테스트도 그 옆에 둔다.
 *
 * 스타일은 Tailwind 클래스로 적는다. **이 패키지는 CSS 를 만들지 않는다** — 클래스 이름만
 * 내보내고, 실제 CSS 는 이 패키지를 쓰는 앱이 자기 파이프라인에서 컴파일한다.
 * `@mfa/tailwind-config` 의 `@source '../ui/src'` 가 그 스캔을 걸어 둔다.
 *
 * 공유 패키지가 CSS 까지 빌드해 배포하면 그 산출물이 새 배포 단위가 되고, 앱이 새 클래스를
 * 쓸 때마다 그걸 먼저 배포해야 한다. MFA 의 독립 배포와 정면으로 어긋난다.
 *
 * 그래서 테스트도 "어떻게 보이나" 가 아니라 "약속한 클래스와 CSS 변수를 실제로 내보내는가" 를 본다.
 */
export * from './Badge';
export * from './Button';
export * from './ErrorBox';
export * from './Panel';
export * from './Skeleton';
