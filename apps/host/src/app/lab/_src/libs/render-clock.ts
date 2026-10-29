/**
 * 실험 패널이 찍는 **서버 렌더 시각**을 읽는다. lab 페이지 셋(ssr · isr · cache)의 측정점이다.
 *
 * 렌더 중에 시계를 읽는 건 일부러다. 그 값이 캐시와 함께 얼어붙는지(isr · cache), 요청마다
 * 바뀌는지(ssr)가 이 실험이 보려는 것이다 — 값이 매번 같으면 측정이 안 된다.
 *
 * 컴포넌트 본문에 `new Date()` 를 직접 쓰지 않고 여기로 뺀 이유:
 * - 측정 방법이 세 페이지에 복제되지 않는다. 바꿀 때 한 곳만 고친다.
 * - 컴포넌트 본문은 순수하게 남는다. `react/purity` 는 렌더 함수 안의 비순수 호출을 잡는데,
 *   이 함수는 렌더 함수가 아니다. **비순수성이 사라진 게 아니라 여기 한 곳에 모였다.**
 *
 * 값은 UTC ISO 다. 화면에 KST 로 바꾸는 건 `formatKst()`(`./format-time`)가 한다.
 */
export function readRenderClock(): string {
  return new Date().toISOString();
}
