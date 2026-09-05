import { REMOTE_NAMES } from '@mfa/remote-config';
import { describe, expect, it } from 'vitest';

import { plan, toOutputLines } from './deploy-targets.ts';

const push = (changed: readonly string[] | null) =>
  plan({ eventName: 'push', target: 'auto', changed });

const names = (p: { remotes: { name: string }[] }) =>
  p.remotes.map((r) => r.name);

describe('배포 대상 판별', () => {
  it('바뀐 디렉터리로 대상을 고른다', () => {
    expect(names(push(['apps/remote-catalog/src/x.tsx']))).toEqual(['catalog']);
    expect(push(['apps/host/src/app/page.tsx'])).toEqual({
      remotes: [],
      host: true,
    });
    expect(push(['docs/00-progress.md'])).toEqual({ remotes: [], host: false });
  });

  it('공유 코드는 전부 배포한다', () => {
    // 셋 다 세 이미지에 들어간다. `.dockerignore` 는 빌드 컨텍스트를 바꾼다(I-7).
    for (const f of [
      'packages/store/src/x.ts',
      'scripts/x.ts',
      '.dockerignore',
    ])
      expect(names(push([f]))).toEqual([...REMOTE_NAMES]);
  });

  it('기준 커밋이 없으면(null) 전부 배포한다', () => {
    // 첫 푸시 · force push. 덜 배포하는 것보다 안전하다.
    expect(names(push(null))).toEqual([...REMOTE_NAMES]);
  });

  it('경로 접두사가 겹쳐도 다른 remote 를 안 끌어온다', () => {
    expect(push(['apps/remote-cartography/src/x.tsx']).remotes).toEqual([]);
  });

  it('workflow_dispatch 는 고른 대상을 따르고, 모르는 값이면 죽는다', () => {
    const d = (target: string) =>
      plan({ eventName: 'workflow_dispatch', target, changed: [] });

    expect(names(d('all'))).toEqual([...REMOTE_NAMES]);
    expect(d('remotes').host).toBe(false);
    expect(d('host').remotes).toEqual([]);
    expect(() => d('catalog')).toThrow(/알 수 없는 배포 대상/);
  });

  it('matrix 가 변수 이름까지 받아간다', () => {
    // 워크플로가 이름 규칙을 다시 조립하면 그 규칙이 두 곳에 산다(I-11).
    const [remotes, host] = toOutputLines(push(null));
    expect(host).toBe('host=true');
    for (const e of JSON.parse(remotes!.replace(/^remotes=/, ''))) {
      expect(e.urlVar).toMatch(/^MF_[A-Z0-9_]+_URL$/);
      expect(e.appVar).toMatch(/^DOKPLOY_APP_[A-Z0-9_]+$/);
    }
    // `if: needs.detect.outputs.remotes != '[]'` 가 이 문자열에 의존한다.
    expect(toOutputLines(push(['README.md']))[0]).toBe('remotes=[]');
  });
});
