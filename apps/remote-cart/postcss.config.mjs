/**
 * Rsbuild 는 `postcss.config.*` 가 있으면 postcss-loader 를 붙인다.
 * 설정 자체는 `@mfa/tailwind-config` 에 있고 여기서는 그대로 재-export 한다 —
 * Tailwind 를 어느 플러그인으로 무는지는 버전마다 바뀌는 지점이라 한 곳에 둔다.
 */
export { default } from '@mfa/tailwind-config/postcss';
