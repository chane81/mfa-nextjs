import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  DEPLOY_IGNORED_PATHS,
  HOST_WORKSPACE_DIR,
  REMOTES,
  REMOTE_LIST,
  REMOTE_NAMES,
} from '@mfa/remote-config';
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

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));

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

  it('workflow_dispatch 는 고른 대상을 따른다', () => {
    const d = (target: DeployTargetOption) =>
      plan({ eventName: 'workflow_dispatch', target, changed: [] });

    expect(names(d('all'))).toEqual([...REMOTE_NAMES]);
    expect(d('remotes').host).toBe(false);
    expect(d('host').remotes).toEqual([]);
  });

  /**
   * `packages/` 는 통짜로 "바뀌면 전부 배포" 다. 그 구멍이 `DEPLOY_IGNORED_PATHS` 이고,
   * 구멍이 뚫린 만큼 **정반대 사고**가 가능해진다 — 앱이 런타임에 쓰는 패키지를
   * 거기 넣으면 배포가 그 변경을 안 물고 나가고, 증상은 "고쳤는데 반영이 안 된다" 다.
   */
  describe('이미지에 안 들어가는 경로는 배포를 안 부른다', () => {
    it('그 경로만 바뀌면 아무것도 배포하지 않는다', () => {
      expect(push(['packages/utils/src/test/cookies.ts'])).toEqual({
        remotes: [],
        host: false,
      });
    });

    it('같이 바뀐 진짜 변경은 그대로 잡는다', () => {
      expect(
        push([
          'packages/utils/src/test/cookies.ts',
          'apps/host/src/app/page.tsx',
        ]),
      ).toEqual({ remotes: [], host: true });
    });

    it.each(DEPLOY_IGNORED_PATHS)(
      '%s 는 어느 앱의 런타임 의존성도 아니다',
      (prefix) => {
        const manifest = JSON.parse(
          readFileSync(resolve(REPO_ROOT, prefix, 'package.json'), 'utf8'),
        ) as { name: string };

        for (const dir of [
          HOST_WORKSPACE_DIR,
          ...REMOTE_LIST.map(({ name }) => REMOTES[name].workspaceDir),
        ]) {
          const app = JSON.parse(
            readFileSync(resolve(REPO_ROOT, dir, 'package.json'), 'utf8'),
          ) as { dependencies?: Record<string, string> };

          expect(
            Object.keys(app.dependencies ?? {}),
            `${dir} 가 ${manifest.name} 을 런타임 의존성으로 쓴다. ` +
              'DEPLOY_IGNORED_PATHS 에서 빼거나 그 import 를 없애세요 — ' +
              '지금은 그 패키지를 고쳐도 배포가 안 나간다.',
          ).not.toContain(manifest.name);
        }
      },
    );
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
