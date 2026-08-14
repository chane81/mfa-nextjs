#!/usr/bin/env node
/**
 * remote 빌드 산출물에 버전을 찍는다.
 *
 * ## 왜 필요한가
 * host 는 remote 를 **런타임에** 받아 서버에서 실행한다. 그래서 두 가지가 필요하다.
 *
 * 1. **불변 아티팩트** — `mf-server.cjs` 는 재배포 때 덮어써진다. 같은 URL 이 다른 코드를
 *    가리키면 롤백도, 캐시된 HTML 과의 정합성 보장도 불가능하다.
 *    `v<hash>/mf-server.cjs` 로 복사해 버전마다 고유 URL 을 만든다.
 *
 * 2. **공표된 현재 버전** — host 를 여러 인스턴스로 띄우면 웹훅은 그중 하나에만 닿는다.
 *    나머지 인스턴스가 스스로 알아채려면 remote 가 "지금 버전이 뭔지"를 공표해야 한다.
 *    `mf-version.json` 이 그 역할이다. host 는 이걸 짧은 TTL 로 폴링해 수렴한다.
 *
 * 버전은 **산출물 내용의 해시**다. 타임스탬프가 아니라 해시인 이유:
 * 내용이 같으면 버전도 같아야 무의미한 캐시 무효화가 안 일어난다.
 *
 * 사용: node scripts/stamp-remote-version.mjs <remote-name> [distDir]
 */
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const [remote, distArg] = process.argv.slice(2);
if (!remote) {
  console.error("usage: stamp-remote-version.mjs <remote-name> [distDir]");
  process.exit(1);
}

const dist = resolve(process.cwd(), distArg ?? "dist");
const ssrBundle = join(dist, "mf-server.cjs");

if (!existsSync(ssrBundle)) {
  console.error(`[stamp] ${ssrBundle} 가 없습니다. SSR 빌드가 먼저 돌아야 합니다.`);
  process.exit(1);
}

/** 웹 번들의 정체성도 버전에 반영한다 — 둘 중 하나만 바뀌어도 새 버전이어야 한다 */
const parts = [readFileSync(ssrBundle)];
const manifest = join(dist, "mf-manifest.json");
if (existsSync(manifest)) parts.push(readFileSync(manifest));

const hash = createHash("sha256");
for (const part of parts) hash.update(part);
const version = hash.digest("hex").slice(0, 12);

const versionDir = join(dist, `v${version}`);
mkdirSync(versionDir, { recursive: true });
copyFileSync(ssrBundle, join(versionDir, "mf-server.cjs"));

writeFileSync(
  join(dist, "mf-version.json"),
  `${JSON.stringify(
    {
      remote,
      version,
      /** host 가 이 경로를 origin 에 붙여 SSR 번들을 받는다 */
      ssrEntry: `/v${version}/mf-server.cjs`,
    },
    null,
    2,
  )}\n`,
);

/**
 * 옛 버전 디렉터리를 3개까지 남긴다.
 *
 * 0개면 롤백이 불가능하고, 무제한이면 dist 가 계속 부푼다.
 * 실제 배포라면 CDN 보존 정책이 할 일이라 여기서는 로컬 실험용 최소치만 둔다.
 */
const KEEP = 3;
const versions = readdirSync(dist, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && entry.name.startsWith("v"))
  .map((entry) => ({ name: entry.name, at: existsSync(join(dist, entry.name, "mf-server.cjs")) }))
  .filter((entry) => entry.at)
  .map((entry) => entry.name)
  .sort();

if (versions.length > KEEP) {
  for (const stale of versions.filter((name) => name !== `v${version}`).slice(0, versions.length - KEEP)) {
    rmSync(join(dist, stale), { recursive: true, force: true });
  }
}

console.log(`[stamp] ${remote} → ${version} (v${version}/mf-server.cjs)`);
