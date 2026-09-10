import { REMOTE_NAMES } from '@mfa/remote-config';
import { describe, expect, it } from 'vitest';

import {
  assertDeployTarget,
  plan,
  toOutputLines,
  type DeployTargetOption,
} from './deploy-targets.ts';

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
    // 넷 다 세 이미지에 들어간다. `.dockerignore` 는 빌드 컨텍스트를 바꾼다(I-7).
    //
    // `packages/utils` 는 지금 테스트 헬퍼뿐이라 "굳이?" 로 보인다. 그래도 여기 둔다 —
    // `packages/` 를 통짜로 보는 것이 이 판별의 성질이고, 예외를 파는 순간 **반대 방향
    // 사고**가 열리기 때문이다. 그 패키지에 프로덕션 유틸이 하나 들어오면 배포가 그
    // 변경을 안 물고 나가고, 증상은 "고쳤는데 반영이 안 된다" 뿐이다(ADR-025).
    // 대가는 헬퍼 한 줄에 세 앱이 다시 나가는 것이고, 그쪽이 훨씬 싸다.
    for (const f of [
      'packages/store/src/x.ts',
      'packages/utils/src/test/cookies.ts',
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

  it('workflow_dispatch 는 고른 대상을 따른다', () => {
    const d = (target: DeployTargetOption) =>
      plan({ eventName: 'workflow_dispatch', target, changed: [] });

    expect(names(d('all'))).toEqual([...REMOTE_NAMES]);
    expect(d('remotes').host).toBe(false);
    expect(d('host').remotes).toEqual([]);
  });

  it('모르는 대상은 경계에서 죽는다', () => {
    // 검증이 `plan` 밖에 있으므로 여기서 본다. YAML 이 오타를 보내면 이 자리다.
    expect(assertDeployTarget('host')).toBe('host');
    expect(() => assertDeployTarget('catalog')).toThrow(/알 수 없는 배포 대상/);
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
