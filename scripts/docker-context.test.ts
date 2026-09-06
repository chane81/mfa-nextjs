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
 * `packages:` 블록만 잘라낸다.
 *
 * 파일 전체에 `- '...'` 정규식을 돌리면 `minimumReleaseAgeExclude` ·
 * `onlyBuiltDependencies` 의 항목까지 같이 걸린다. 거기에 `'@scope/*'` 모양이 하나만
 * 들어와도 그걸 워크스페이스 디렉터리로 오인해 엉뚱한 자리를 가리키는 실패를 낸다.
 */
const packagesBlock = (yaml: string): string[] => {
  const lines = yaml.split('\n');
  const start = lines.findIndex((line) => /^packages:\s*(#.*)?$/.test(line));
  if (start === -1) {
    throw new Error(
      'pnpm-workspace.yaml 에 `packages:` 키가 없습니다. 형식이 바뀌었으면 이 파서를 같이 고치세요.',
    );
  }

  // 다시 들여쓰기 0 으로 돌아오는 줄(= 다음 최상위 키)까지가 이 블록이다.
  const rest = lines.slice(start + 1);
  const end = rest.findIndex(
    (line) => line.trim() !== '' && !line.startsWith('#') && !/^\s/.test(line),
  );
  return end === -1 ? rest : rest.slice(0, end);
};

/**
 * 워크스페이스 디렉터리를 `pnpm-workspace.yaml` **에서 읽는다.**
 *
 * 여기 배열로 적어두면 그게 SSOT 의 복제가 된다 — 글롭이 늘었을 때 이 검사가 조용히
 * 덜 세게 되고, 그 상태가 정확히 이 테스트가 막으려는 드리프트다.
 *
 * ⚠️ 그래서 **모르는 모양을 건너뛰지 않고 던진다.** 예전에는 `'<dir>/*'` 만 골라 담았다.
 * 그러면 `- 'tools/**'` 같은 항목이 늘었을 때 그 디렉터리만 조용히 빠지고, 남은 항목이
 * 있으니 개수 검사도 통과한다 — 그 밑의 패키지가 Dockerfile 목록과 **한 번도 대조되지
 * 않는다.** 그게 이 테스트가 막으려던 I-10 드리프트 그 자체다. 못 읽는 모양을 만나면
 * 여기서 크게 실패하는 편이 맞다.
 */
export const parseWorkspaceDirs = (yaml: string): string[] => {
  const entries = packagesBlock(yaml)
    .map((line) => /^\s*-\s*(.+)$/.exec(line)?.[1])
    .filter((raw): raw is string => raw !== undefined)
    // 인라인 주석과 따옴표를 벗긴다.
    .map((raw) => raw.replace(/\s+#.*$/, '').trim())
    .map((raw) => raw.replace(/^(['"])(.*)\1$/, '$2'));

  if (entries.length === 0) {
    throw new Error(
      'pnpm-workspace.yaml 의 `packages:` 블록이 비어 있습니다. ' +
        '형식이 바뀌었으면 이 파서를 같이 고치세요.',
    );
  }

  return entries.map((glob) => {
    const dir = /^([^*?[\]{}!]+)\/\*$/.exec(glob)?.[1];
    if (dir === undefined) {
      throw new Error(
        `pnpm-workspace.yaml 의 워크스페이스 글롭 '${glob}' 을 읽지 못했습니다. ` +
          "이 검사는 '<dir>/*' 형태만 디렉터리로 풀 수 있습니다 — " +
          '글롭을 늘렸으면 이 파서를 같이 고치세요. 그냥 건너뛰면 그 디렉터리의 패키지가 ' +
          'Dockerfile 의 deps 목록과 대조되지 않습니다(known-issues I-10).',
      );
    }
    return dir;
  });
};

const workspaceDirs = (): string[] =>
  parseWorkspaceDirs(
    readFileSync(resolve(REPO_ROOT, 'pnpm-workspace.yaml'), 'utf8'),
  );

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

describe('pnpm-workspace.yaml 파서', () => {
  it('`packages:` 블록의 글롭만 읽는다', () => {
    // 다른 목록에도 `'<something>/*'` 모양이 들어올 수 있다. 그걸 워크스페이스
    // 디렉터리로 세면 존재하지 않는 경로를 가리키는 실패가 난다.
    const yaml = [
      'packages:',
      "  - 'apps/*'",
      "  - 'packages/*' # 인라인 주석",
      '',
      'onlyBuiltDependencies:',
      "  - 'esbuild/*'",
    ].join('\n');

    expect(parseWorkspaceDirs(yaml)).toEqual(['apps', 'packages']);
  });

  it('풀지 못하는 글롭을 만나면 건너뛰지 않고 던진다', () => {
    // 조용히 빠지면 그 디렉터리의 패키지가 Dockerfile 목록과 대조되지 않는다 —
    // 이 테스트가 막으려는 드리프트가 이 검사 안에서 재발하는 것이다.
    const yaml = ['packages:', "  - 'apps/*'", "  - 'tools/**'"].join('\n');

    expect(() => parseWorkspaceDirs(yaml)).toThrow(/tools\/\*\*/);
  });

  it('`packages:` 키가 사라지면 던진다', () => {
    expect(() => parseWorkspaceDirs('engineStrict: true\n')).toThrow(
      /packages:/,
    );
  });
});

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
