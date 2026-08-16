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
 *   /mf-version.json   no-store  — "지금 버전이 뭔지"는 항상 최신이어야 한다
 *
 * 사용: node scripts/serve-remote-dist.mjs <port> [distDir]
 */
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';

const [portArg, distArg] = process.argv.slice(2);
const port = Number(portArg ?? 3001);
const dist = resolve(process.cwd(), distArg ?? 'dist');

const TYPES = {
  '.js': 'application/javascript; charset=utf-8',
  '.cjs': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.map': 'application/json; charset=utf-8',
};

createServer((req, res) => {
  const path = decodeURIComponent((req.url ?? '/').split('?')[0]);

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
    path.startsWith('/v') && path !== '/mf-version.json'
      ? 'public, max-age=31536000, immutable'
      : 'no-store',
  );

  createReadStream(file).pipe(res);
}).listen(port, () => console.log(`[serve-dist] :${port} → ${dist}`));
