/**
 * PostCSS 설정 원본.
 *
 * Tailwind v4 를 PostCSS 로 물리는 앱(host = Next, catalog · cart = Rsbuild)이 이 값을
 * 그대로 재-export 한다.
 *
 * 값 자체는 세 줄이지만 여기 두는 이유는 **Tailwind 를 어느 PostCSS 플러그인으로 물리는가**가
 * 버전마다 바뀌는 지점이기 때문이다. v3 은 `tailwindcss` 를 직접 플러그인으로 넣었고
 * v4 는 `@tailwindcss/postcss` 로 분리됐다. 앱마다 복제해 두면 그 이행을 두 곳에서 한다.
 */
export default {
  plugins: {
    '@tailwindcss/postcss': {},
  },
};
