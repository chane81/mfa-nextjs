#!/usr/bin/env node
/**
 * remote `dist` 가 HTTP 로 떠 있는 동안 명령 하나를 실행한다.
 *
 * 사용: node ../../scripts/with-remote-dist.mjs <명령> [인자...]
 *
 * ## 왜 필요한가
 *
 * host 빌드는 순수한 컴파일이 아니다. 프리렌더 중에 remote 의 SSR 번들을 **HTTP 로 받아
 * 실행**한다(`apps/host/src/mf/server-loader.ts`). 그래서 빌드 시점에 remote 오리진이
 * 살아 있어야 한다. 배포에서는 remote 가 이미 떠 있어서 안 보이던 요구사항이다.
 *
 * ## 왜 turbo 가 이걸 못 하나
 *
 * 순서(`remote build` → `host build`)는 turbo 가 한다. `turbo.json` 의
 * `@mfa/host#build.dependsOn` 이 그거다. turbo 가 못 하는 건 **"띄운 채로 두었다가 끝나면
 * 내리기"** 한 걸음뿐이다.
 *
 * turbo 의 런타임 의존 패턴은 `with`(동시 실행 사이드카) + 유한 readiness 프로브다.
 * 실측해보면 순서도 준비 대기도 정확히 동작하는데, 사이드카가 `persistent: true` 라
 * host 빌드가 끝나도 죽지 않고 **`turbo run build` 자체가 종료하지 않는다.**
 * 그 패턴은 Ctrl-C 로 끝내는 `dev` 용이지 반드시 exit 해야 하는 `build` 용이 아니다.
 *
 * 그래서 그 한 걸음만 여기서 감싼다. 순서는 계속 turbo 가 소유한다.
 *
 * ## 이미 떠 있으면 건드리지 않는다
 *
 * Docker/배포에서는 `REMOTE_*_SSR_ENTRY` 가 배포된 공개 도메인이라 이미 응답한다.
 * 그때는 아무것도 띄우지 않고 그대로 통과한다. 원격 오리진이 응답하지 않으면
 * **로컬 dist 로 대신 띄우지 않고 실패시킨다** — 배포된 것과 다른 코드로 빌드된
 * host 가 나오는 게 더 나쁘다.
 */
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { connect } from "node:net";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const [command, ...args] = process.argv.slice(2);
if (!command) {
  console.error("usage: with-remote-dist.mjs <command> [args...]");
  process.exit(1);
}

/**
 * `ssrEntryKey` 는 host 가 "이 오리진에서 받겠다"고 읽는 값이다.
 * 서빙할 자리를 여기서 파생시켜야 host 가 보는 곳과 어긋나지 않는다.
 */
const REMOTES = [
  {
    name: "catalog",
    dist: "apps/remote-catalog/dist",
    ssrEntryKey: "REMOTE_CATALOG_SSR_ENTRY",
    defaultEntry: "http://localhost:3001/mf-server.cjs",
  },
  {
    name: "cart",
    dist: "apps/remote-cart/dist",
    ssrEntryKey: "REMOTE_CART_SSR_ENTRY",
    defaultEntry: "http://localhost:3002/mf-server.cjs",
  },
];

/**
 * host 의 env 파일을 우리도 읽는다.
 *
 * `apps/host/.env.local` 은 Next 가 자기 프로세스 안에서 로드하는 파일이라 이 스크립트의
 * `process.env` 에는 없다. 여기서 안 읽으면 "host 는 A 에서 받는데 우리는 B 에 띄우는"
 * 어긋남이 조용히 생긴다. 우선순위는 Next 와 같게: 셸 env > .env.local > .env > 기본값.
 */
function readEnvFile(file) {
  if (!existsSync(file)) return {};
  const out = {};
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 1) continue;
    out[trimmed.slice(0, eq).trim()] = trimmed
      .slice(eq + 1)
      .trim()
      .replace(/^["']|["']$/g, "");
  }
  return out;
}

const hostEnv = {
  ...readEnvFile(resolve(repoRoot, "apps/host/.env")),
  ...readEnvFile(resolve(repoRoot, "apps/host/.env.local")),
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 이 오리진이 host 가 쓸 수 있는 상태인가 — 버전 매니페스트가 곧 그 계약이다 */
async function serving(origin) {
  try {
    const res = await fetch(`${origin}/mf-version.json`, { signal: AbortSignal.timeout(3000) });
    return res.ok;
  } catch {
    return false;
  }
}

// URL.hostname 은 IPv6 를 대괄호째 돌려준다(`[::1]`). 두 형태를 다 넣어둔다.
const LOOPBACK = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

/**
 * 그 포트에 **누군가** 듣고 있는가.
 *
 * `serving()` 만으로는 "아무도 없다"와 "다른 서버가 잡고 있다"를 구분하지 못한다.
 * 구분이 필요한 이유는 우리 서버가 그 위에 뜨는 데 **성공할 수도 있기** 때문이다 —
 * dev 서버가 `127.0.0.1` 에 바인딩하면 우리는 `::` 에 붙을 수 있고, 그러면 요청은
 * 계속 dev 서버로 가는데 우리 프로세스는 멀쩡히 살아 있다. 죽기를 기다려도 안 죽고
 * 타임아웃까지 가서 "응답하지 않습니다" 라는 엉뚱한 결론이 나온다.
 */
function portInUse(hostname, port) {
  return new Promise((done) => {
    // net.connect 는 대괄호 없는 주소를 받는다
    const socket = connect({ host: hostname.replace(/^\[|\]$/g, ""), port: Number(port) });
    const settle = (result) => {
      socket.destroy();
      done(result);
    };
    socket.setTimeout(1500);
    socket.once("connect", () => settle(true));
    socket.once("timeout", () => settle(false));
    socket.once("error", () => settle(false));
  });
}

/** 우리가 띄운 서버만 담는다. 원래 떠 있던 건 건드리지 않는다. */
const spawned = [];
const stopSpawned = () => {
  for (const child of spawned.splice(0)) child.kill();
};

async function ensureServed(remote) {
  const url = new URL(process.env[remote.ssrEntryKey] || hostEnv[remote.ssrEntryKey] || remote.defaultEntry);
  const { origin } = url;

  if (await serving(origin)) return;

  if (!LOOPBACK.has(url.hostname)) {
    throw new Error(
      `remote '${remote.name}' 오리진에 닿지 않습니다: ${origin}\n` +
        `  host 빌드는 프리렌더 중에 이 오리진에서 SSR 번들을 받습니다.\n` +
        `  원격 오리진은 로컬 dist 로 대신 띄우지 않습니다 — 배포된 것과 다른 코드로 빌드되기 때문입니다.`,
    );
  }

  const dist = resolve(repoRoot, remote.dist);
  if (!existsSync(resolve(dist, "mf-version.json"))) {
    throw new Error(
      `remote '${remote.name}' 빌드 산출물이 없습니다: ${dist}/mf-version.json\n` +
        `  turbo 가 remote 를 먼저 빌드했어야 합니다(turbo.json 의 @mfa/host#build.dependsOn).`,
    );
  }

  const port = url.port || (url.protocol === "https:" ? "443" : "80");

  if (await portInUse(url.hostname, port)) {
    throw new Error(
      `:${port} 를 이미 다른 서버가 쓰고 있는데 ${origin}/mf-version.json 을 주지 않습니다.\n` +
        `  dev 서버일 가능성이 높습니다 — dev 는 버전 매니페스트를 공표하지 않습니다.\n` +
        `  dev 를 내리고 빌드하세요(빌드는 dev 가 아니라 dist 를 서빙해야 합니다).`,
    );
  }

  const child = spawn("node", [resolve(repoRoot, "scripts/serve-remote-dist.mjs"), port, dist], {
    cwd: repoRoot,
    stdio: ["ignore", "ignore", "inherit"],
  });
  spawned.push(child);

  // 위 점유 검사를 빠져나온 경합(그 사이에 누가 포트를 잡음)까지 대비한 안전망.
  // 죽은 걸 모르고 기다리면 타임아웃까지 시간만 버린다.
  let exited = null;
  child.on("exit", (code) => {
    exited = code;
  });

  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (exited !== null) {
      throw new Error(
        `remote '${remote.name}' 정적 서버가 :${port} 에서 죽었습니다 (exit ${exited}).\n` +
          `  그 포트에 dev 서버가 떠 있지 않은지 확인하세요.`,
      );
    }
    if (await serving(origin)) {
      console.log(`[with-remote-dist] ${remote.name} → ${origin} (dist 서빙)`);
      return;
    }
    await sleep(200);
  }
  throw new Error(`remote '${remote.name}' 정적 서버가 ${origin} 에서 응답하지 않습니다`);
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    stopSpawned();
    process.exit(1);
  });
}

try {
  for (const remote of REMOTES) await ensureServed(remote);

  process.exitCode = await new Promise((done, fail) => {
    const child = spawn(command, args, { stdio: "inherit", shell: process.platform === "win32" });
    child.on("error", fail);
    child.on("exit", (code, signal) => done(signal ? 1 : (code ?? 1)));
  });
} catch (error) {
  console.error(`\n[with-remote-dist] ${error instanceof Error ? error.message : error}`);
  process.exitCode = 1;
} finally {
  stopSpawned();
}
