import { resolve } from 'node:path';

import { exposedNames } from '@mfa/contracts';
import { readExposes } from '@mfa/remote-config/node';
import { describe, expect, it } from 'vitest';

/**
 * **번들러 설정과 계약이 갈라지는 것을 여기서 잡는다.**
 *
 * 이 remote 의 `exposes` 는 손으로 적지 않고 `src/exposes/` 를 읽어서 만든다
 * (`readExposes`, 설정 파일 주석 참고). 편하지만 대신 **파일 하나를 놓는 것만으로
 * 공개 계약이 바뀐다.** 그래서 그 결과가 `@mfa/contracts` 의 `MODULE_IDS` 와 같은지
 * 대조한다. 잡히는 경우가 둘이다.
 *
 *   파일만 추가        `MODULE_IDS` 에 등록을 안 했다 → host 가 그 모듈을 모른다
 *   계약에만 있다      파일이 없거나 이름이 다르다 → 런타임에 "expose 없음" 으로 죽는다
 *
 * 스캔 인자는 설정 파일과 **같은 값이어야** 의미가 있다. 갈라지면 이 테스트가 실제로
 * 빌드되는 목록이 아닌 다른 것을 검사하게 된다.
 *
 * `cwd` 만 다르다 — 설정 파일은 앱 디렉터리에서 평가되지만 vitest 는 **저장소 루트**에서
 * 돈다. 그래서 앱 루트를 이 파일 위치에서 계산해 넘긴다.
 */
const APP_ROOT = resolve(import.meta.dirname, '../..');

const scanned = readExposes('./src/exposes', {
  ignore: [/\.test\.tsx$/],
  cwd: APP_ROOT,
});

describe('catalog expose 계약', () => {
  it('스캔한 파일 목록이 계약의 모듈 이름과 정확히 같다', () => {
    const fromFiles = Object.keys(scanned.exposes)
      .map((key) => key.slice('./'.length))
      .sort();

    expect(fromFiles).toEqual([...exposedNames('catalog')].sort());
  });

  it('expose 키는 전부 `./` 로 시작한다 — MF 가 요구하는 형식이다', () => {
    for (const key of Object.keys(scanned.exposes)) {
      expect(key.startsWith('./')).toBe(true);
    }
  });

  it('테스트 파일은 노출되지 않는다', () => {
    expect(scanned.files.some((f) => f.includes('.test.'))).toBe(false);
  });
});
