#!/usr/bin/env node
/**
 * remote 가 방금 만든 빌드를 "현재 버전"으로 공표한다. 빌드 **후에** 실행된다.
 *
 * ## 왜 필요한가
 * host 는 remote 를 런타임에 받아 서버에서 실행한다. 그래서 두 가지가 필요하다.
 *
 * 1. **불변 아티팩트** — 자산이 재배포 때 덮어써지면 롤백도, 캐시된 HTML 과의 정합성
 *    보장도 불가능하다. 웹·SSR 산출물이 전부 `v<version>/` 아래로 나가므로
 *    한 번 배포된 URL 의 내용은 다시 바뀌지 않는다.
 *
 * 2. **공표된 현재 버전** — host 를 여러 인스턴스로 띄우면 재배포 웹훅은 하나에만 닿는다.
 *    나머지가 스스로 알아채려면 remote 가 "지금 버전이 뭔지"를 공표해야 한다.
 *    host 는 `mf-version.json` 을 짧은 TTL 로 읽어 수렴한다.
 *
 * 롤백은 이 파일만 옛 버전으로 되돌리면 된다. 자산은 그대로 남아 있다.
 *
 * 사용: node scripts/stamp-remote-version.ts <remote-name> [distDir]
 */
import { createHash, createPrivateKey, sign } from 'node:crypto';
import {
  existsSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  MF_FILES,
  type RemoteName,
  type SignedManifestFields,
  assertRemoteName,
  signedPayload,
  versionedPath,
} from '@mfa/remote-config';
import { readBuildVersion } from '@mfa/remote-config/node';

/**
 * 옛 버전 디렉터리를 몇 개까지 남길지.
 * 0개면 롤백이 불가능하고, 무제한이면 dist 가 계속 부푼다.
 * 실제 배포라면 CDN 보존 정책이 할 일이라 여기서는 로컬 실험용 최소치만 둔다.
 */
export const KEEP_VERSIONS = 3;

/** SRI 형식. host 가 받은 바이트를 평가 **전에** 이 값과 대조한다. */
export function integrity(file: string): string {
  return `sha384-${createHash('sha384').update(readFileSync(file)).digest('base64')}`;
}

/**
 * 서명이 덮는 필드를 만든다. 순서와 정규화는 `signedPayload` 가 맡고,
 * 여기서는 **무엇을 담을지**만 정한다.
 *
 * 반환 타입이 `Required<…>` 인 이유: `SignedManifestFields` 는 두 integrity 를 optional 로
 * 둔다(host 가 서명 없는 매니페스트도 읽어야 해서). 하지만 stamp 는 **항상 둘 다 채운다** —
 * 그냥 `SignedManifestFields` 로 두면 호출부가 `payload.ssrIntegrity!` 로 `!` 를 달게 되고,
 * 그러면 나중에 진짜로 안 채우게 됐을 때 타입이 잡아주지 못한다.
 *
 * `remote` 는 `RemoteName` 이다. `string` 으로 두면 `assertRemoteName` 을 안 거친 값이
 * 서명 페이로드의 **첫 필드**로 들어갈 수 있다 — 그 오타는 host 의 서명 검증에서야 터진다.
 */
export function buildPayload(
  remote: RemoteName,
  version: string,
  versionDir: string,
): Required<SignedManifestFields> {
  return {
    remote,
    version,
    /** host 서버가 받아 실행하는 node 번들 */
    ssrEntry: versionedPath(MF_FILES.ssrBundle, version),
    /** 브라우저 MF 런타임이 읽는 매니페스트 */
    webEntry: versionedPath(MF_FILES.webManifest, version),
    ssrIntegrity: integrity(join(versionDir, MF_FILES.ssrBundle)),
    webIntegrity: integrity(join(versionDir, MF_FILES.webManifest)),
  };
}

/**
 * 서명은 **오리진이 통째로 털린 경우**를 막는 유일한 수단이다.
 * 오리진이 주는 해시와 오리진이 주는 번들을 대조하는 것만으로는 못 막는다.
 *
 * 키가 없으면 서명 없이 내보낸다. host 쪽에서 `MF_REQUIRE_SIGNATURE=1` 로 강제할 수 있다.
 *
 * **직렬화는 `@mfa/remote-config` 의 `signedPayload` 가 한다.** 예전에는 이 파일과 host 의
 * `remote-trust.ts` 가 같은 배열을 각자 적고 주석으로 "같은 형식" 이라고만 적어 뒀다.
 * 갈라지면 매니페스트는 멀쩡히 만들어지고 배포도 성공하는데 **host 의 검증만 실패**하고,
 * 원인이 두 파일의 배열 차이라는 게 어느 로그에도 안 남는다.
 */
export function signManifest(
  payload: SignedManifestFields,
  signingKey: string | undefined,
): string | null {
  if (!signingKey) return null;

  const key = createPrivateKey({
    key: Buffer.from(signingKey, 'base64'),
    format: 'der',
    type: 'pkcs8',
  });
  return sign(null, Buffer.from(signedPayload(payload), 'utf8'), key).toString(
    'base64',
  );
}

/**
 * 지워야 할 옛 버전 디렉터리. **오래된 것부터**, 현재 버전은 절대 포함하지 않는다.
 *
 * 버전 문자열은 정렬 가능한 형식이 아니라 mtime 으로 줄을 세운다. 남길 개수는 전체
 * 디렉터리 수에서 세므로, 현재 버전도 그 `keep` 안에 든다.
 */
export function staleVersionDirs(
  dist: string,
  currentVersion: string,
  keep: number = KEEP_VERSIONS,
): string[] {
  const dirs = readdirSync(dist, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith('v'))
    .map((entry) => entry.name)
    .filter((name) => existsSync(join(dist, name, MF_FILES.ssrBundle)))
    .sort(
      (a, b) =>
        statSync(join(dist, a)).mtimeMs - statSync(join(dist, b)).mtimeMs,
    );

  return dirs
    .filter((name) => name !== `v${currentVersion}`)
    .slice(0, Math.max(0, dirs.length - keep));
}

function main(): void {
  const [remoteArg, distArg] = process.argv.slice(2);
  if (!remoteArg) {
    console.error('usage: stamp-remote-version.ts <remote-name> [distDir]');
    process.exit(1);
  }
  /**
   * 이름을 여기서 검증하는 이유는 이 값이 **서명 대상 페이로드의 첫 필드**이기 때문이다.
   * 오타난 이름으로 stamp 하면 매니페스트 자체는 멀쩡히 만들어지고, host 가 받아서
   * 서명을 검증할 때야 실패한다 — 원인에서 한참 떨어진 자리에서 터진다.
   */
  const remote = assertRemoteName(remoteArg);

  const cwd = process.cwd();
  const dist = resolve(cwd, distArg ?? 'dist');

  /**
   * 버전 판정은 번들러 config 와 **같은 함수**를 쓴다. 여기서 따로 읽으면 "빈 파일을
   * 어떻게 볼 것인가" 같은 판단이 갈라지고, 그러면 stamp 가 찾는 디렉터리와 빌드가
   * 만든 디렉터리가 어긋난다.
   */
  const versionFile = resolve(cwd, '.mf-version');
  const version = readBuildVersion(cwd);
  if (!version) {
    console.error(
      existsSync(versionFile)
        ? '[stamp] .mf-version 이 비어 있습니다. mf-build-version.ts 가 버전을 못 정했습니다.'
        : '[stamp] .mf-version 이 없습니다. 빌드 전에 mf-build-version.ts 가 돌아야 합니다.',
    );
    process.exit(1);
  }

  const versionDir = join(dist, `v${version}`);
  const ssrBundle = join(versionDir, MF_FILES.ssrBundle);
  const manifest = join(versionDir, MF_FILES.webManifest);

  for (const [label, file] of [
    ['SSR 번들', ssrBundle],
    ['MF 매니페스트', manifest],
  ] as const) {
    if (!existsSync(file)) {
      console.error(`[stamp] ${label} 이 없습니다: ${file}`);
      process.exit(1);
    }
  }

  /**
   * 내용 해시는 버전으로 쓰지 않고 메타로만 남긴다.
   * 버전은 빌드 ID 라 내용이 같아도 매번 달라지는데, "실제로 코드가 바뀌었는지"는
   * 이 값으로 판단할 수 있다(불필요한 배포를 걸러내는 용도).
   */
  const hash = createHash('sha256');
  hash.update(readFileSync(ssrBundle));
  hash.update(readFileSync(manifest));

  const payload = buildPayload(remote, version, versionDir);
  const signature = signManifest(payload, process.env.MF_SIGNING_KEY);

  writeFileSync(
    join(dist, MF_FILES.versionManifest),
    `${JSON.stringify(
      {
        ...payload,
        contentHash: hash.digest('hex').slice(0, 12),
        ...(signature ? { signature } : {}),
      },
      null,
      2,
    )}\n`,
  );

  console.log(
    `[stamp] 무결성 ${payload.ssrIntegrity.slice(0, 20)}… / 서명 ${signature ? '있음' : '없음'}`,
  );

  for (const stale of staleVersionDirs(dist, version)) {
    rmSync(join(dist, stale), { recursive: true, force: true });
    console.log(`[stamp] 오래된 버전 정리: ${stale}`);
  }

  /**
   * 버전 파일은 여기서 지운다.
   *
   * 남겨두면 다음 `dev` 실행이 이 파일을 주워 버전 경로로 빌드하려 든다.
   * dev 는 버전이 필요 없고(메모리 서빙), 매 저장마다 경로가 바뀌면 오히려 방해다.
   * 버전은 이 시점부터 `mf-version.json` 이 단독으로 들고 있다.
   */
  rmSync(versionFile, { force: true });

  console.log(`[stamp] ${remote} → ${version} (v${version}/)`);
}

/**
 * **직접 실행될 때만** stamp 한다. 가드가 없으면 `import` 만으로 인자를 파싱하고
 * `process.exit` 로 러너를 죽인다.
 */
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main();
}
