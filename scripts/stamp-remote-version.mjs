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
 * 사용: node scripts/stamp-remote-version.mjs <remote-name> [distDir]
 */
import { createHash, createPrivateKey, sign } from "node:crypto";
import { existsSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const [remote, distArg] = process.argv.slice(2);
if (!remote) {
  console.error("usage: stamp-remote-version.mjs <remote-name> [distDir]");
  process.exit(1);
}

const cwd = process.cwd();
const dist = resolve(cwd, distArg ?? "dist");

const versionFile = resolve(cwd, ".mf-version");
if (!existsSync(versionFile)) {
  console.error("[stamp] .mf-version 이 없습니다. 빌드 전에 mf-build-version.mjs 가 돌아야 합니다.");
  process.exit(1);
}
const version = readFileSync(versionFile, "utf8").trim();
if (!version) {
  console.error("[stamp] .mf-version 이 비어 있습니다. mf-build-version.mjs 가 버전을 못 정했습니다.");
  process.exit(1);
}

const versionDir = join(dist, `v${version}`);
const ssrBundle = join(versionDir, "mf-server.cjs");
const manifest = join(versionDir, "mf-manifest.json");

for (const [label, file] of [
  ["SSR 번들", ssrBundle],
  ["MF 매니페스트", manifest],
]) {
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
const hash = createHash("sha256");
hash.update(readFileSync(ssrBundle));
hash.update(readFileSync(manifest));

/** SRI 형식. host 가 받은 바이트를 평가 **전에** 이 값과 대조한다. */
const integrity = (file) => `sha384-${createHash("sha384").update(readFileSync(file)).digest("base64")}`;

const payload = {
  remote,
  version,
  /** host 서버가 받아 실행하는 node 번들 */
  ssrEntry: `/v${version}/mf-server.cjs`,
  /** 브라우저 MF 런타임이 읽는 매니페스트 */
  webEntry: `/v${version}/mf-manifest.json`,
  ssrIntegrity: integrity(ssrBundle),
  webIntegrity: integrity(manifest),
};

/**
 * 서명은 **오리진이 통째로 털린 경우**를 막는 유일한 수단이다.
 * 오리진이 주는 해시와 오리진이 주는 번들을 대조하는 것만으로는 못 막는다.
 *
 * 키가 없으면 서명 없이 내보낸다. host 쪽에서 `MF_REQUIRE_SIGNATURE=1` 로 강제할 수 있다.
 * 서명 대상은 신뢰 판단에 쓰이는 필드만, 고정 순서로 (host 의 signedPayload 와 같은 형식).
 */
const signedPayload = JSON.stringify([
  payload.remote,
  payload.version,
  payload.ssrEntry,
  payload.webEntry,
  payload.ssrIntegrity,
  payload.webIntegrity,
]);

let signature = null;
if (process.env.MF_SIGNING_KEY) {
  const key = createPrivateKey({
    key: Buffer.from(process.env.MF_SIGNING_KEY, "base64"),
    format: "der",
    type: "pkcs8",
  });
  signature = sign(null, Buffer.from(signedPayload, "utf8"), key).toString("base64");
}

writeFileSync(
  join(dist, "mf-version.json"),
  `${JSON.stringify(
    {
      ...payload,
      contentHash: hash.digest("hex").slice(0, 12),
      ...(signature ? { signature } : {}),
    },
    null,
    2,
  )}\n`,
);

console.log(`[stamp] 무결성 ${payload.ssrIntegrity.slice(0, 20)}… / 서명 ${signature ? "있음" : "없음"}`);

/**
 * 옛 버전 디렉터리를 3개까지 남긴다.
 * 0개면 롤백이 불가능하고, 무제한이면 dist 가 계속 부푼다.
 * 실제 배포라면 CDN 보존 정책이 할 일이라 여기서는 로컬 실험용 최소치만 둔다.
 */
const KEEP = 3;
const dirs = readdirSync(dist, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && entry.name.startsWith("v"))
  .map((entry) => entry.name)
  .filter((name) => existsSync(join(dist, name, "mf-server.cjs")))
  // 오래된 것부터 지운다. 버전 문자열은 정렬 가능한 형식이 아니라 mtime 을 쓴다.
  .sort((a, b) => statSync(join(dist, a)).mtimeMs - statSync(join(dist, b)).mtimeMs);

for (const stale of dirs.filter((name) => name !== `v${version}`).slice(0, Math.max(0, dirs.length - KEEP))) {
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
