import '@testing-library/jest-dom/vitest';

import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

/**
 * `dom` 프로젝트 전용 셋업.
 *
 * RTL 은 **`globals: true` 일 때만** 자동으로 cleanup 을 건다(전역 `afterEach` 를 찾아
 * 스스로 등록하는 방식). 이 저장소는 명시적 import 스타일이라 globals 를 끄고 쓰므로
 * 여기서 직접 걸어야 한다. 안 걸면 이전 테스트가 렌더한 DOM 이 그대로 남아
 * `getByRole` 이 "Found multiple elements" 로 죽는다.
 */
afterEach(cleanup);
