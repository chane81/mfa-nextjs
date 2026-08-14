/** 실험 모드 메타데이터. 인덱스 페이지가 remote 트리를 끌고 오지 않도록 별도 모듈로 분리했다. */

export type LabMode = "ssr" | "isr" | "cache";

export interface LabModeSpec {
  label: string;
  hue: number;
  /** 이 모드를 만드는 라우트 세그먼트 설정 한 줄 */
  segmentConfig: string;
  expect: string;
  branch?: string;
}

export const LAB_MODES: Record<LabMode, LabModeSpec> = {
  ssr: {
    label: "SSR — 요청마다 렌더",
    hue: 205,
    segmentConfig: "await connection()",
    expect:
      "새로고침할 때마다 서버 렌더 시각이 바뀐다. host 프로세스가 remote 번들을 이미 평가해뒀다면 재평가는 없지만, 렌더는 요청마다 돈다.",
  },
  isr: {
    label: "ISR — 주기 재생성",
    hue: 140,
    segmentConfig: '"use cache" + cacheLife({ revalidate: 60 })',
    expect:
      "서버 렌더 시각이 60초 동안 얼어붙는다. 그 사이 remote 마크업은 캐시된 HTML 에서 그대로 나온다.",
  },
  cache: {
    label: "Cache Components — use cache",
    hue: 45,
    segmentConfig: '"use cache" + cacheLife() + cacheTag()',
    expect:
      "셸은 캐시된 RSC 페이로드에서 나온다. remote 가 정적 셸에 들어가는지, Suspense 구멍으로 스트리밍되는지가 관전 포인트.",
  },
};

export const LAB_ORDER: LabMode[] = ["ssr", "isr", "cache"];
