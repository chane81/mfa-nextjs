import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * **Dockerfile 의 `deps` 스테이지 목록 ≡ 워크스페이스.**
 *
 * 그 스테이지는 레이어 캐시를 위해 워크스페이스 package.json 을 손으로 나열한다.
 * 목록이 셋 적었는데도 `pnpm install --frozen-lockfile` 은 성공했다 — pnpm 이 없는
 * 디렉터리를 향해 심링크를 먼저 만들고, `COPY . .` 가 소스를 덮으면 그게 살아나기
 * 때문이다. 안 살아나는 건 그 패키지들의 `node_modules` 라, 나중에 `zustand` ·
 * `tailwindcss` 해석이 실패한다(I-10).
 *
 * CI 의 docker job 이 실제 이미지를 빌드하므로 결국 거기서도 잡힌다. 이 테스트는
 * **빠르고, 무슨 줄을 넣어야 하는지 말해준다** — docker job 은 몇 분 뒤에
 * `Cannot find module 'zustand'` 만 던진다.
 */
const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));

/** `pnpm-workspace.yaml` 의 글롭. 두 줄뿐이라 그대로 적고, 바뀌면 아래 테스트가 잡는다. */
const WORKSPACE_DIRS = ['apps', 'packages'] as const;

const workspaceManifests = (): string[] =>
  WORKSPACE_DIRS.flatMap((dir) =>
    readdirSync(resolve(REPO_ROOT, dir), { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => `${dir}/${e.name}/package.json`)
      .filter((rel) => existsSync(join(REPO_ROOT, rel))),
  ).sort();

const dockerfiles = (): string[] =>
  readdirSync(resolve(REPO_ROOT, 'apps'), { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => `apps/${e.name}/Dockerfile`)
    .filter((rel) => existsSync(join(REPO_ROOT, rel)))
    .sort();

/** `COPY apps/host/package.json apps/host/` 형태만. 루트 package.json 은 세지 않는다. */
const copiedManifests = (text: string): string[] =>
  [...text.matchAll(/^COPY\s+(\S+\/package\.json)\s/gm)]
    .map((m) => m[1]!)
    .sort();

describe('Dockerfile 의 deps 스테이지 목록', () => {
  it('워크스페이스 글롭이 이 검사와 같은 전제를 쓴다', () => {
    // 글롭이 늘면 workspaceManifests 가 조용히 덜 세게 된다.
    const yaml = readFileSync(
      resolve(REPO_ROOT, 'pnpm-workspace.yaml'),
      'utf8',
    );
    const globs = [...yaml.matchAll(/^\s*-\s*'([^']+)'/gm)]
      .map((m) => m[1]!)
      .filter((g) => g.includes('*'));
    expect(globs).toEqual(WORKSPACE_DIRS.map((d) => `${d}/*`));
  });

  it.each(dockerfiles())('%s 의 목록이 워크스페이스와 같다', (rel) => {
    const copied = copiedManifests(
      readFileSync(resolve(REPO_ROOT, rel), 'utf8'),
    );
    const expected = workspaceManifests();

    expect(
      copied,
      `${rel} 을 이렇게 맞추세요:\n` +
        expected
          .map((m) => `COPY ${m} ${m.replace(/package\.json$/, '')}`)
          .join('\n'),
    ).toEqual(expected);
  });
});
