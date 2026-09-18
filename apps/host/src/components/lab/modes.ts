/** 실험 모드 메타데이터. 인덱스 페이지가 remote 트리를 끌고 오지 않도록 별도 모듈로 분리했다. */
import type { RemoteName } from '@mfa/contracts';

export type LabMode = 'ssr' | 'isr' | 'cache';

/**
 * 실험이 의존하는 remote. **세 페이지가 같은 remote 를 봐야 비교가 성립한다** —
 * `/lab/isr` 과 `/lab/cache` 는 수명 정책만 다르고 나머지가 같다는 게 실험의 전제다.
 *
 * 각 페이지가 `'catalog'` 를 따로 적고 있었다. 타입이 `RemoteName` 유니온이라 리네임은
 * 막히지만, **실험 대상을 다른 remote 로 옮길 때 한쪽만 고치면** 두 페이지가 다른 태그를
 * 달고도 초록이다. 그러면 비교 결과가 조용히 무의미해진다.
 */
export const LAB_REMOTE: RemoteName = 'catalog';

export interface LabModeSpec {
  label: string;
  hue: number;
  /** 이 모드를 만드는 코드 한 줄 */
  segmentConfig: string;
  expect: string;
}

export const LAB_MODES: Record<LabMode, LabModeSpec> = {
  ssr: {
    label: '요청마다 렌더 (구 force-dynamic)',
    hue: 205,
    segmentConfig: 'await connection() + <Suspense>',
    expect:
      '새로고침할 때마다 서버 렌더 시각이 바뀐다. 정적 셸은 프리렌더되고 이 패널만 요청 시 스트리밍된다(PPR).',
  },
  isr: {
    label: 'ISR 등가 (구 revalidate = 60)',
    hue: 140,
    segmentConfig: '"use cache" + cacheLife({ revalidate: 60 })',
    expect:
      '서버 렌더 시각이 60초 동안 얼어붙는다. 그 사이 remote 마크업은 캐시된 HTML 에서 그대로 나온다.',
  },
  cache: {
    label: '태그 무효화 (MFA 에 필요한 형태)',
    hue: 45,
    segmentConfig: '"use cache" + cacheLife("minutes") + cacheTag(remote)',
    expect:
      '시간이 아니라 이벤트로 깬다. remote 재배포 웹훅이 이 태그를 만료시키면 즉시 재생성된다.',
  },
};

export const LAB_ORDER: LabMode[] = ['ssr', 'isr', 'cache'];
