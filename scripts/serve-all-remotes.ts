#!/usr/bin/env node

/**
 * remote 의 `dist` 를 **전부** 띄운 채로 명령 하나를 돌리고, 끝나면 같이 내린다.
 *
 *   node scripts/serve-all-remotes.ts -- next build
 *   node scripts/serve-all-remotes.ts -- pnpm mf:types
 *
 * ## 왜 필요한가
 *
 * 이 저장소에는 "remote 정적 서버를 띄운 채 한 명령을 돌린다" 는 자리가 **두 곳**이다.
 *
 *   apps/host/package.json 의 build   프리렌더가 remote SSR 번들을 실제로 받아 실행한다
 *   .github/workflows/ci.yml          커밋된 MF DTS 가 최신인지 확인한다
 *
 * 둘 다 `concurrently` 로 remote 를 하나씩 나열하고 있었다. 즉 같은 지식(어떤 remote 를
 * 띄워야 하나)이 SSOT 밖에 두 벌 더 있었고, remote 를 추가하면 양쪽을 같이 고쳐야 했다.
 * 빠뜨리면 그 remote 만 프리렌더에서 ECONNREFUSED 로 죽는다.
 *
 * ## 왜 `concurrently` 가 아니라 in-process 서버인가
 *
 * `serve-remote-dist.ts` 는 이미 핸들러를 export 한다(테스트용). 그걸 그대로 쓰면
 * 자식 프로세스가 N+1 개에서 1개로 줄고, 포트 준비 시점을 **기다릴 수 있게** 된다 —
 * `concurrently` 로는 그 순서를 못 만든다. 지금은 컴파일이 앞을 막아 경쟁이 성립하지
 * 않지만(turbo.json 주석 참고), 그 사실에 기대지 않는 편이 낫다.
 */

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { REMOTE_LIST } from '@mfa/remote-config';

import { createHandler } from './serve-remote-dist.ts';

export interface RemoteServerSpec {
  name: string;
  port: number;
  dist: string;
}

const repoRoot = (): string => fileURLToPath(new URL('..', import.meta.url));

/** 띄울 서버 목록. **`REMOTE_LIST` 가 정한다 — 이 파일에 remote 이름이 없다.** */
export function remoteServers(root: string = repoRoot()): RemoteServerSpec[] {
  return REMOTE_LIST.map(({ name, devPort, workspaceDir }) => ({
    name,
    port: devPort,
    dist: resolve(root, workspaceDir, 'dist'),
  }));
}

/**
 * 인자에서 실행할 명령을 뽑는다. `--` 뒤가 명령이다.
 *
 * `--` 를 강제하는 이유: 나중에 이 스크립트 자신에게 옵션이 생겨도 그 경계가 안 흔들린다.
 */
export function parseCommand(argv: readonly string[]): string[] {
  const at = argv.indexOf('--');
  const command = at === -1 ? [] : argv.slice(at + 1);
  if (command.length === 0) {
    throw new Error(
      '실행할 명령이 없습니다. 사용법: node scripts/serve-all-remotes.ts -- <명령> [인자...]',
    );
  }
  return command;
}

function listen(spec: RemoteServerSpec): Promise<Server> {
  return new Promise((ok, fail) => {
    const server = createServer(createHandler(spec.dist));
    server.once('error', fail);
    server.listen(spec.port, () => {
      console.log(`[serve-all] ${spec.name} :${spec.port} → ${spec.dist}`);
      ok(server);
    });
  });
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const [command, ...args] = parseCommand(process.argv.slice(2));

  const specs = remoteServers();

  /**
   * dist 가 없으면 여기서 멈춘다.
   *
   * 없는 채로 띄우면 서버는 뜨고 모든 요청이 404 가 되어, 정작 실패는 한참 뒤
   * "SSR 번들 응답 404" 로 나타난다. 원인에서 먼 자리다.
   */
  const missing = specs.filter((spec) => !existsSync(spec.dist));
  if (missing.length > 0) {
    console.error(
      `remote dist 가 없습니다: ${missing.map((m) => m.name).join(', ')}\n` +
        `'pnpm build' 를 먼저 돌리세요 (turbo 가 remote 를 host 보다 먼저 빌드합니다).`,
    );
    process.exit(1);
  }

  const servers = await Promise.all(specs.map(listen));

  const child = spawn(command!, args, { stdio: 'inherit' });

  const shutdown = (code: number): never => {
    for (const server of servers) server.close();
    process.exit(code);
  };

  child.on('exit', (code, signal) => shutdown(signal ? 1 : (code ?? 1)));
  child.on('error', (error) => {
    console.error(`명령을 실행하지 못했습니다: ${command}`, error);
    shutdown(1);
  });
}
