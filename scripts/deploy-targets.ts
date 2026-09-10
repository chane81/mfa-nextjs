#!/usr/bin/env node

/* eslint-disable turbo/no-undeclared-env-vars --
 * 여기서 읽는 env 는 GitHub Actions 런타임이 주는 값이고 turbo 태스크에서는 안 읽힌다.
 * `globalEnv` 에 넣으면 그 값이 바뀔 때마다 모든 태스크가 캐시를 놓친다(turbo 문서).
 */

/**
 * 무엇을 배포할지 정한다. `.github/actions/detect-targets` 가 부른다.
 *
 * 예전에는 이 판별이 composite action 의 bash 안에 있었고 remote 이름이 여섯 번 리터럴로
 * 적혀 있었다. 그때 무엇이 조용히 틀렸는지는 known-issues I-11 에 있다.
 *
 * ⚠️ SSOT 를 **상대 경로 + `.ts` 확장자**로 들인다. detect job 은 체크아웃만 하고
 * `pnpm install` 을 하지 않기 때문이다(배포 대상을 정하려고 의존성 전체를 받을 이유가
 * 없다). 워크스페이스 별칭은 pnpm 심링크가 있어야 풀리므로 그 경로에서는 못 쓴다.
 * `packages/remote-config/src/index.ts` 에 import 가 하나도 없어서 Node 24 의 타입
 * 스트리핑만으로 그냥 읽힌다 — 그 파일에 import 를 추가하면 이 job 이 깨진다.
 *
 * 확장자를 붙이는 건 저장소 전역 규칙의 **예외**다. 근거는 `.claude/rules/mf-runtime.md`
 * 의 "번들러를 안 거치는 `scripts/`" 절, tsc 쪽 허용은 루트 `tsconfig.json` 의
 * `allowImportingTsExtensions` 주석에 있다.
 */

import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

import {
  DEPLOY_IGNORED_PATHS,
  HOST_WORKSPACE_DIR,
  REMOTES,
  REMOTE_NAMES,
  SHARED_DEPLOY_PATHS,
  deployTarget,
  type RemoteDeployTarget,
} from '../packages/remote-config/src/index.ts';

export interface DeployPlan {
  remotes: RemoteDeployTarget[];
  host: boolean;
}

/**
 * `workflow_dispatch` 로 손수 고를 수 있는 값.
 *
 * 문자열로 받아 `plan` 안에서 걸러내던 것을 밖으로 뺐다. 검증을 경계에 두면 `plan` 은
 * 넷 중 하나만 받고, 목록이 늘 때 고칠 자리가 이 배열 하나가 된다 —
 * `action.yml` 의 `description` 도 여기서 읽어 쓰지는 못하지만 대조할 원본은 생긴다.
 */
export const DEPLOY_TARGETS = ['auto', 'all', 'remotes', 'host'] as const;
export type DeployTargetOption = (typeof DEPLOY_TARGETS)[number];

export function assertDeployTarget(value: string): DeployTargetOption {
  if (!(DEPLOY_TARGETS as readonly string[]).includes(value)) {
    throw new Error(
      `알 수 없는 배포 대상 '${value}'. 가능한 값: ${DEPLOY_TARGETS.join(', ')}`,
    );
  }
  return value as DeployTargetOption;
}

const ALL: DeployPlan = {
  remotes: REMOTE_NAMES.map(deployTarget),
  host: true,
};

/**
 * @param eventName GitHub 이벤트 이름. 열린 집합이라 좁히지 않는다 —
 *                  이 판별이 보는 건 `workflow_dispatch` 하나뿐이고 나머지는 전부 auto 다.
 * @param changed 바뀐 파일 경로들. `null` 은 "비교할 기준 커밋이 없다"는 뜻이고
 *                (첫 푸시 · force push) 그때는 전부 배포한다 — 덜 배포하는 것보다 낫다.
 */
export function plan({
  eventName,
  target,
  changed,
}: {
  eventName: string;
  target: DeployTargetOption;
  changed: readonly string[] | null;
}): DeployPlan {
  if (eventName === 'workflow_dispatch' && target !== 'auto') {
    if (target === 'all') return ALL;
    if (target === 'remotes') return { ...ALL, host: false };
    return { remotes: [], host: true };
  }

  if (changed === null) return ALL;

  /**
   * 이미지 안에서 실행되지 않는 경로를 먼저 걷어낸다(`DEPLOY_IGNORED_PATHS`).
   *
   * 걷어내지 않으면 `packages/` 통짜 규칙에 걸려 **테스트 헬퍼 한 줄에 세 앱이 전부
   * 재배포된다.** 여기서 지우면 그 파일만 바뀐 push 는 아래 어느 갈래에도 안 걸려
   * "배포 없음" 으로 끝난다 — 의도한 결과다.
   */
  const relevant = changed.filter(
    (file) => !DEPLOY_IGNORED_PATHS.some((prefix) => file.startsWith(prefix)),
  );

  const touches = (prefix: string): boolean =>
    relevant.some((file) => file === prefix || file.startsWith(prefix));

  // 공유 코드는 세 이미지가 전부 다시 빌드해야 한다.
  if (SHARED_DEPLOY_PATHS.some(touches)) return ALL;

  return {
    remotes: REMOTE_NAMES.filter((name) =>
      // 디렉터리 경계까지 붙여서 본다 — `remote-cart` 가 `remote-cartography` 를 안 끌어온다.
      touches(`${REMOTES[name].workspaceDir}/`),
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
    target: assertDeployTarget(process.env.TARGET || 'auto'),
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
