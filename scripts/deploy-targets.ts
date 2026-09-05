#!/usr/bin/env node

/* eslint-disable turbo/no-undeclared-env-vars --
 * 여기서 읽는 env 는 GitHub Actions 런타임이 주는 값이고 turbo 태스크에서는 안 읽힌다.
 * `globalEnv` 에 넣으면 그 값이 바뀔 때마다 모든 태스크가 캐시를 놓친다(turbo 문서).
 */

/**
 * 무엇을 배포할지 정한다. `.github/actions/detect-targets` 가 부른다.
 *
 * 예전에는 이 판별이 composite action 의 bash 안에 있었고 remote 이름이 **여섯 번**
 * 리터럴로 적혀 있었다. remote 를 추가하고 그중 하나만 빠뜨리면 CI 는 초록인데 그
 * remote 의 배포 job 이 **아예 안 생긴다** — 로그에도 `remotes=[] host=false` 라고
 * 정상처럼 찍힌다(I-11).
 *
 * ⚠️ SSOT 를 **상대 경로**로 들인다. detect job 은 체크아웃만 하고 `pnpm install` 을
 * 하지 않기 때문이다(배포 대상을 정하려고 의존성 전체를 받을 이유가 없다).
 * `packages/remote-config/src/index.ts` 에 import 가 하나도 없어서 Node 24 의 타입
 * 스트리핑만으로 그냥 읽힌다 — 그 파일에 import 를 추가하면 이 job 이 깨진다.
 */

import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

import {
  HOST_WORKSPACE_DIR,
  REMOTE_NAMES,
  SHARED_DEPLOY_PATHS,
  deployTarget,
  type RemoteDeployTarget,
} from '../packages/remote-config/src/index.ts';

export interface DeployPlan {
  remotes: RemoteDeployTarget[];
  host: boolean;
}

const ALL: DeployPlan = {
  remotes: REMOTE_NAMES.map(deployTarget),
  host: true,
};

/**
 * @param changed 바뀐 파일 경로들. `null` 은 "비교할 기준 커밋이 없다"는 뜻이고
 *                (첫 푸시 · force push) 그때는 전부 배포한다 — 덜 배포하는 것보다 낫다.
 */
export function plan({
  eventName,
  target,
  changed,
}: {
  eventName: string;
  target: string;
  changed: readonly string[] | null;
}): DeployPlan {
  if (eventName === 'workflow_dispatch' && target !== 'auto') {
    if (target === 'all') return ALL;
    if (target === 'remotes') return { ...ALL, host: false };
    if (target === 'host') return { remotes: [], host: true };
    throw new Error(
      `알 수 없는 배포 대상 '${target}'. 가능한 값: auto, all, remotes, host`,
    );
  }

  if (changed === null) return ALL;

  const touches = (prefix: string): boolean =>
    changed.some((file) => file === prefix || file.startsWith(prefix));

  // 공유 코드는 세 이미지가 전부 다시 빌드해야 한다.
  if (SHARED_DEPLOY_PATHS.some(touches)) return ALL;

  return {
    remotes: REMOTE_NAMES.filter((name) =>
      // 디렉터리 경계까지 붙여서 본다 — `remote-cart` 가 `remote-cartography` 를 안 끌어온다.
      touches(`${deployTarget(name).workspaceDir}/`),
    ).map(deployTarget),
    host: touches(`${HOST_WORKSPACE_DIR}/`),
  };
}

/** GitHub Actions 출력. matrix 가 `fromJSON` 으로 그대로 받는다. */
export function toOutputLines({ remotes, host }: DeployPlan): string[] {
  return [`remotes=${JSON.stringify(remotes)}`, `host=${String(host)}`];
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  /**
   * `CHANGED` 가 **없는 것**과 **빈 것**은 다르다.
   *   미설정   → 기준 커밋이 없다   → 전부 배포
   *   빈 문자열 → 바뀐 파일이 없다  → 아무것도 배포하지 않는다
   * 그 구분은 호출부(action.yml)가 `has_base` 로 만든다.
   */
  const raw = process.env.CHANGED;
  const result = plan({
    eventName: process.env.EVENT ?? '',
    target: process.env.TARGET || 'auto',
    changed:
      raw === undefined
        ? null
        : raw
            .split('\n')
            .map((line) => line.trim())
            .filter(Boolean),
  });

  const out = process.env.GITHUB_OUTPUT;
  if (out) appendFileSync(out, `${toOutputLines(result).join('\n')}\n`, 'utf8');

  console.log(
    `대상 — remotes=${result.remotes.map((r) => r.name).join(',') || '(없음)'} host=${result.host}`,
  );
}
