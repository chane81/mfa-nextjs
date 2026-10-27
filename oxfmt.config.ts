import { defineConfig } from 'oxfmt';

/**
 * 저장소 전체의 포맷 설정. prettier 3.6.2 에서 옮겨왔다(ADR-028).
 * 옵션은 옛 `.prettierrc.json` 과 같고, `ignorePatterns` 는 옛 `.prettierignore` 다.
 */
export default defineConfig({
  singleQuote: true,
  jsxSingleQuote: false,
  trailingComma: 'all',
  // oxfmt 기본값은 100 이다. prettier 시절의 80 을 지켜 diff 를 줄인다.
  printWidth: 80,
  // oxfmt 는 기본으로 package.json 키를 정렬한다. prettier 는 안 했으므로 끈다.
  sortPackageJson: false,
  ignorePatterns: [
    // 빌드 산출물
    '.next/',
    'dist/',
    'out/',
    '.turbo/',

    // 잠금 파일
    'pnpm-lock.yaml',

    /**
     * MF DTS 생성물. **커밋하지만 포맷하지 않는다.**
     * 포매터가 손대면 `pnpm mf:types` 가 만든 원본과 매번 달라져서,
     * CI 의 "타입이 낡았는가" diff 검사가 항상 실패한다.
     *
     * `src/generated/module-ids.ts` 는 제외하지 않는다 — 생성 코드가 포매터 출력과 같은
     * 모양으로 쓰므로 포맷해도 안 바뀐다(그건 확인해 뒀다).
     */
    'packages/contracts/src/generated/@mf-types',

    /**
     * graft 설치기가 넣은 파일. **커밋하지만 포맷하지 않는다.**
     * 포매터가 손대면 graft 를 다시 설치할 때마다 원본과 어긋나서
     * `format:check` 가 변경하지도 않은 파일에서 실패한다.
     */
    '.mcp.json',
    '.claude/settings.json',
    '.claude/helpers/',
    '.claude/skills/graft/',
  ],
});
