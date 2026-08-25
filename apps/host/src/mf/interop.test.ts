import {
  type MockInstance,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import { normalizeModule } from './interop';

/**
 * `import * as X` 의 결과 모양은 번들러 · 모드 · 대상(CJS·ESM)에 따라 달라진다.
 * CJS interop 이 씌운 `{ default: … }` 를 그대로 remote 에 넘기면 remote 안에서
 * `_jsxDEV is not a function` 이 난다(Next dev 에서 실제 재현).
 */

/**
 * ⚠️ 스파이를 모듈 스코프에서 한 번만 걸면 안 된다. `restoreMocks: true` 가 테스트마다
 * 원본을 되돌려놓아서 두 번째 테스트부터는 진짜 `console.warn` 이 불린다 — 단언은
 * "0번 호출됨" 으로 실패하고 콘솔에는 경고가 그대로 찍힌다.
 */
let warn: MockInstance<typeof console.warn>;
beforeEach(() => {
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('normalizeModule', () => {
  it('프로브가 최상위에 있으면 그대로 돌려준다', () => {
    const mod = { jsx: () => null, jsxs: () => null };
    expect(normalizeModule(mod, 'jsx')).toBe(mod);
    expect(warn).not.toHaveBeenCalled();
  });

  it('default 아래 있으면 언랩한다', () => {
    const inner = { jsx: () => null };
    expect(normalizeModule({ default: inner }, 'jsx')).toBe(inner);
    expect(warn).not.toHaveBeenCalled();
  });

  it('최상위를 default 보다 우선한다', () => {
    // 둘 다 있으면 이미 정상 모양이라는 뜻이다.
    const top = { jsx: () => null, default: { jsx: () => null } };
    expect(normalizeModule(top, 'jsx')).toBe(top);
  });

  it('프로브가 함수가 아니면 못 찾은 것으로 본다', () => {
    // 이름만 있고 값이 함수가 아니면 그 모듈은 우리가 찾던 게 아니다.
    const mod = { jsx: '함수가 아님' };
    expect(normalizeModule(mod, 'jsx')).toBe(mod);
    expect(warn).toHaveBeenCalledOnce();
  });

  it('못 찾으면 원본을 그대로 돌려주고 경고한다', () => {
    // 던지지 않는다 — remote 가 자기 사본을 쓰는 건 최선은 아니어도 동작은 한다.
    const mod = { somethingElse: () => null };
    expect(normalizeModule(mod, 'jsx')).toBe(mod);
    expect(warn).toHaveBeenCalledOnce();
    expect(warn.mock.calls[0]![0]).toContain("'jsx'");
  });

  it('프로덕션에서는 경고하지 않는다', () => {
    vi.stubEnv('NODE_ENV', 'production');
    expect(normalizeModule({}, 'jsx')).toEqual({});
    expect(warn).not.toHaveBeenCalled();
  });

  it.each([
    ['undefined', undefined],
    ['null', null],
    ['빈 객체', {}],
  ])('%s 이어도 던지지 않는다', (_label, mod) => {
    expect(() => normalizeModule(mod, 'jsx')).not.toThrow();
    expect(normalizeModule(mod, 'jsx')).toBe(mod);
  });

  it('default 가 함수여도 안전하다', () => {
    // 함수에 프로브 이름의 프로퍼티가 없으면 그냥 못 찾은 경우가 된다.
    const mod = { default: () => null };
    expect(normalizeModule(mod, 'jsx')).toBe(mod);
  });

  it('프로브 이름에 따라 다른 판단을 한다', () => {
    const inner = { createElement: () => null };
    const mod = { default: inner };
    expect(normalizeModule(mod, 'createElement')).toBe(inner);
    expect(normalizeModule(mod, 'jsx')).toBe(mod);
  });
});
