#!/usr/bin/env node
/**
 * remote 의 `dist` 를 정적으로 서빙한다. CDN 을 흉내내는 최소 서버.
 *
 * ## 왜 번들러 preview 를 안 쓰나
 * 버전 접두사(`/v<ver>/...`)를 서빙하는 방식이 Vite preview 와 Rsbuild preview 가 서로 다르다.
 * remote 마다 다른 번들러를 쓰는 게 이 저장소의 전제라, 배포 표면은 하나로 통일하는 편이
 * 계약을 선명하게 만든다. 실제 배포에서도 이 자리는 CDN 이지 번들러가 아니다.
 *
 * ## 캐시 헤더
 *   /v<ver>/...        immutable — 버전 경로는 내용이 바뀌지 않는다
 *   그 외              no-store  — "지금 버전이 뭔지"는 항상 최신이어야 한다
 *
 * ## ⚠️ 이 파일은 **런타임 이미지 안에서도 돈다** — 의존을 함부로 늘리면 안 된다
 *
 * 각 remote 의 Dockerfile runner 스테이지는 이 파일 **하나만** 복사하고
 * `node_modules` 를 두지 않는다. 그래서 워크스페이스 패키지를 정적 import 하면
 * 컨테이너가 `ERR_MODULE_NOT_FOUND` 로 부팅에 실패한다.
 *
 * 그래서 인자를 두 갈래로 받는다.
 *
 *   <port> <distDir>     의존 0. **이미지가 타는 길**이다 (scripts/docker/remote-entrypoint.sh
 *                        가 `"$PORT" "$DATA_DIR"` 로 부른다). 이 경로는 절대 깨뜨리지 말 것.
 *   <remote-name>        `@mfa/remote-config` 를 **동적** import 해서 포트·dist 를 파생한다.
 *                        로컬 `pnpm start` / host 빌드용. 이미지에서는 이 분기를 안 타므로
 *                        import 자체가 실행되지 않는다.
 *
 * 포트 지식이 호출부마다 복사되는 걸 막으면서(이름 경로), 이미지의 자립성도 지킨다(숫자 경로).
 */
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

interface Target {
  label: string;
  port: number;
  dist: string;
}

function usage(): never {
  console.error(
    'usage: serve-remote-dist.ts <remote-name> [distDir]\n' +
      '       serve-remote-dist.ts <port> <distDir>   (의존 없는 경로 — 컨테이너용)',
  );
  process.exit(1);
}

/**
 * dist 위치를 **cwd 가 아니라 리포지터리 루트** 기준으로 푼다.
 * 이름 경로를 부르는 자리가 두 곳이고 cwd 가 서로 다르기 때문이다 —
 * remote 의 `start`(cwd = 그 remote)와 host 의 `build`(cwd = apps/host).
 * `scripts/` 는 리포 루트 바로 아래라 이 파일 위치가 곧 기준점이다.
 */
function repoRoot(): string {
  return fileURLToPath(new URL('..', import.meta.url));
}

async function resolveTarget(
  first: string | undefined,
  second: string | undefined,
): Promise<Target> {
  if (!first) usage();

  // 숫자 = 포트 직접. 워크스페이스를 건드리지 않는다 (컨테이너에는 node_modules 가 없다).
  if (/^\d+$/.test(first)) {
    if (!second) {
      console.error('포트를 직접 줄 때는 distDir 도 함께 줘야 합니다.');
      process.exit(1);
    }
    return {
      label: '',
      port: Number(first),
      dist: resolve(process.cwd(), second),
    };
  }

  const { REMOTES, assertRemoteName } = await import('@mfa/remote-config');
  const remote = REMOTES[assertRemoteName(first)];
  return {
    label: `${remote.name} `,
    port: remote.devPort,
    dist: second
      ? resolve(process.cwd(), second)
      : resolve(repoRoot(), remote.workspaceDir, 'dist'),
  };
}

const [firstArg, secondArg] = process.argv.slice(2);
const { label, port, dist } = await resolveTarget(firstArg, secondArg);

const TYPES: Record<string, string> = {
  '.js': 'application/javascript; charset=utf-8',
  '.cjs': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.map': 'application/json; charset=utf-8',
};

/**
 * 버전 디렉터리(`/v<ver>/…`)만 불변이다.
 *
 * 파일명 목록으로 판정하지 않는 이유는 이 파일이 SSOT 를 못 읽는 경로에서도 돌기 때문이다
 * (위 주석 참고). 경로 **형태**로 판정하면 의존 없이 같은 결론이 나온다.
 */
const VERSIONED = /^\/v[^/]+\//;

createServer((req, res) => {
  const path = decodeURIComponent((req.url ?? '/').split('?')[0]!);

  // `..` 로 dist 밖을 못 나가게 한다
  const target = join(dist, normalize(path).replace(/^(\.\.[/\\])+/, ''));
  if (!target.startsWith(dist)) {
    res.statusCode = 403;
    res.end('forbidden');
    return;
  }

  const file =
    existsSync(target) && statSync(target).isDirectory()
      ? join(target, 'index.html')
      : target;
  if (!existsSync(file)) {
    res.statusCode = 404;
    res.end('not found');
    return;
  }

  res.setHeader(
    'Content-Type',
    TYPES[extname(file)] ?? 'application/octet-stream',
  );
  // host(3000) 가 교차 출처로 remoteEntry 를 받아야 한다
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader(
    'Cache-Control',
    VERSIONED.test(path) ? 'public, max-age=31536000, immutable' : 'no-store',
  );

  createReadStream(file).pipe(res);
}).listen(port, () => console.log(`[serve-dist] ${label}:${port} → ${dist}`));
