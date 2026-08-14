/** host / remote 가 공유하는 디자인 토큰. CSS 파이프라인 차이를 피하려고 인라인 스타일 값으로 배포한다. */
export const tokens = {
  color: {
    bg: "#0b0d12",
    surface: "#141821",
    surfaceAlt: "#1b2130",
    border: "#252c3b",
    text: "#e6e9ef",
    textMuted: "#98a2b3",
    accent: "#6ea8fe",
    accentText: "#0b0d12",
    danger: "#f87171",
    success: "#4ade80",
  },
  radius: { sm: "6px", md: "10px", lg: "16px" },
  space: (n: number): string => `${n * 4}px`,
  font: {
    body: "-apple-system, BlinkMacSystemFont, 'Pretendard', 'Apple SD Gothic Neo', system-ui, sans-serif",
    mono: "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, monospace",
  },
} as const;

/** remote 경계를 눈으로 확인하기 위한 점선 테두리 */
export const remoteBoundary = (label: string, hue: number) =>
  ({
    position: "relative",
    border: `1px dashed hsl(${hue} 70% 60% / 0.55)`,
    borderRadius: tokens.radius.lg,
    padding: tokens.space(5),
    "--remote-label": `"${label}"`,
  }) as const;
