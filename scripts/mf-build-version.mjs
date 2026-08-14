#!/usr/bin/env node
/**
 * 빌드 버전을 정해 `.mf-version` 에 적는다. 빌드 **전에** 실행된다.
 *
 * ## 왜 내용 해시가 아니라 빌드 ID 인가
 * 자산 URL 접두사(`base` / `assetPrefix`)는 빌드가 시작되기 전에 정해져야 하는데,
 * 내용 해시는 빌드가 끝나야 나온다. 순환이라 해시로는 웹 자산을 버전 경로에 담을 수 없다.
 *
 * 대신 잃는 것: "내용이 같으면 버전도 같다". 변경 없이 재빌드하면 새 버전이 되어
 * host 가 한 번 헛 무효화한다(warm 1회 + 재생성 1회). 실제 CDN 배포가 다 이 방식이고,
 * 내용 해시는 `mf-version.json` 에 메타로 남겨 동일성 판단에 쓸 수 있게 한다.
 *
 * 우선순위: MF_BUILD_VERSION → git short SHA(+dirty) → 타임스탬프
 */
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

function gitVersion() {
  try {
    const sha = execFileSync("git", ["rev-parse", "--short=10", "HEAD"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    const dirty = execFileSync("git", ["status", "--porcelain"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    // 커밋되지 않은 변경이 있으면 같은 SHA 로 다른 산출물이 나온다. 구분자를 붙인다.
    return dirty ? `${sha}-${Date.now().toString(36)}` : sha;
  } catch {
    return null;
  }
}

const version =
  process.env.MF_BUILD_VERSION ?? gitVersion() ?? `t${Date.now().toString(36)}`;

/** 자산 경로에 들어가므로 안전한 문자만 남긴다 */
const safe = version.replace(/[^a-zA-Z0-9._-]/g, "-");

writeFileSync(resolve(process.cwd(), ".mf-version"), `${safe}\n`);
console.log(`[version] ${safe}`);
