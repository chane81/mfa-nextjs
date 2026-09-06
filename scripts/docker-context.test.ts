import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * **Dockerfile 의 `deps` 스테이지 목록 ≡ 워크스페이스.**
 *
 * 그 스테이지는 레이어 캐시를 위해 워크스페이스 package.json 을 손으로 나열한다.
 * 목록이 어긋나도 `pnpm install --frozen-lockfile` 은 성공하고 빌드가 한참 뒤에 죽는다 —
 * 재현 조건과 왜 안 죽는지는 known-issues I-10 에 있다.
 *
 * **이게 유일한 방어선이다.** CI 에서 이미지를 빌드해보던 job 은 39차에 뺐다(ADR-023) —
 * 게이트가 아니어서 아무것도 못 막았다. 여기서 놓치면 다음 검증은 배포다.
 * 대신 이건 오프라인이고 빠르며 **어느 파일에 무슨 줄을 넣어야 하는지 말해준다** —
 * 배포는 몇 분 뒤에 `Cannot find module 'zustand'` 만 던진다.
 */
const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));

/**
 * 워크스페이스 디렉터리를 `pnpm-workspace.yaml` **에서 읽는다.**
 *
 * 여기 배열로 적어두면 그게 SSOT 의 복제가 된다 — 글롭이 늘었을 때 이 검사가 조용히
 * 덜 세게 되고, 그 상태가 정확히 이 테스트가 막으려는 드리프트다.
 *
 * `packages: - 'apps/*'` 형태의 글롭만 본다. 접미 `/*` 를 떼어 디렉터리 이름으로 쓴다.
 */
const workspaceDirs = (): string[] => {
  const yaml = readFileSync(resolve(REPO_ROOT, 'pnpm-workspace.yaml'), 'utf8');
  const dirs = [...yaml.matchAll(/^\s*-\s*'([^']+)\/\*'\s*$/gm)].map(
    (m) => m[1]!,
  );
  if (dirs.length === 0) {
    throw new Error(
      "pnpm-workspace.yaml 에서 '<dir>/*' 글롭을 하나도 못 찾았습니다. " +
        '글롭 형식이 바뀌었으면 이 파서를 같이 고치세요.',
    );
  }
  return dirs;
};

const workspaceManifests = (): string[] =>
  workspaceDirs()
    .flatMap((dir) =>
      readdirSync(resolve(REPO_ROOT, dir), { withFileTypes: true })
        .filter((e) => e.isDirectory())
        .map((e) => `${dir}/${e.name}/package.json`)
        .filter((rel) => existsSync(join(REPO_ROOT, rel))),
    )
    .sort();

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
  it('워크스페이스 글롭을 실제로 읽어낸다', () => {
    // 파서가 조용히 0개를 돌려주면 아래 대조가 통째로 무의미해진다.
    // 글롭 형식이 바뀌면 여기서 먼저 죽는다.
    const dirs = workspaceDirs();
    expect(dirs.length).toBeGreaterThan(0);
    for (const dir of dirs) {
      expect(existsSync(resolve(REPO_ROOT, dir)), `${dir} 가 없습니다`).toBe(
        true,
      );
    }
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
