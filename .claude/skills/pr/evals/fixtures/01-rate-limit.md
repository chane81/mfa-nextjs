# 브랜치 상태 — `feat/rate-limit` (base: `main`)

저장소: 사내 결제 API (Node 22 / Fastify 5 / Postgres). 커밋 메시지는 한글.

## `git log --oneline main..HEAD`

```
c81f0a2 test(limiter): 버킷이 창을 넘어가는 경계를 본다
9d3e77b feat(limiter): 토큰 버킷을 Redis 로 옮긴다
41b0c9e refactor(limiter): 한도 판정을 미들웨어 밖으로 뺀다
2fa5561 chore: ioredis 를 의존성에 넣는다
```

## `git diff main...HEAD --stat`

```
 package.json                          |   1 +
 pnpm-lock.yaml                        |  38 +++++
 src/limiter/bucket.ts                 |  94 ++++++++++++
 src/limiter/bucket.test.ts            | 121 ++++++++++++++++
 src/limiter/index.ts                  |  47 +++---
 src/middleware/rate-limit.ts          |  78 +++-------
 src/middleware/rate-limit.test.ts     |  34 ++---
 src/config.ts                         |   6 +
 8 files changed, 331 insertions(+), 88 deletions(-)
```

## 핵심 변경

### `src/middleware/rate-limit.ts`

```diff
-const counters = new Map<string, { hits: number; resetAt: number }>();
-
-export async function rateLimit(req, reply) {
-  const key = req.ip;
-  const now = Date.now();
-  const held = counters.get(key);
-  if (!held || held.resetAt < now) {
-    counters.set(key, { hits: 1, resetAt: now + WINDOW_MS });
-    return;
-  }
-  held.hits += 1;
-  if (held.hits > MAX_HITS) reply.code(429).send({ error: 'too many requests' });
-}
+export async function rateLimit(req, reply) {
+  const verdict = await takeToken(req.ip);
+  if (!verdict.allowed) {
+    reply.header('retry-after', String(verdict.retryAfterSec));
+    reply.code(429).send({ error: 'too many requests' });
+  }
+}
```

### `src/limiter/bucket.ts` (신규)

Lua 스크립트 하나로 `GET` · 보충 계산 · `SET` 을 원자적으로 처리한다.
`EVALSHA` 로 캐시하고 `NOSCRIPT` 면 한 번 다시 올린다.

### `src/config.ts`

```diff
+  RATE_LIMIT_REDIS_URL: str({ default: 'redis://127.0.0.1:6379' }),
+  RATE_LIMIT_MAX: num({ default: 100 }),
+  RATE_LIMIT_WINDOW_SEC: num({ default: 60 }),
```

## 배경 (작업 중 알게 된 것)

- 원래 한도가 **프로세스 메모리**에 있었다. 인스턴스를 2대로 늘린 뒤부터 실효 한도가
  2배가 됐는데, 429 가 안 나가니 아무도 몰랐다. 로그를 뒤져서 찾았다.
- 처음엔 `INCR` + `EXPIRE` 두 번 호출로 짰다. 두 명령 사이에 프로세스가 죽으면
  키가 TTL 없이 남아 그 IP 가 영구 차단된다. 그래서 Lua 로 합쳤다.
- `retry-after` 헤더는 원래 없었다. 클라이언트가 즉시 재시도해서 부하가 더 늘었다.
- Redis 가 죽으면 어떻게 할지 고민했다. 한도를 못 세면 **통과시킨다**(fail-open).
  결제 API 라 막는 쪽이 더 위험하다.
- `@fastify/rate-limit` 플러그인을 검토했다가 뺐다. 우리 키 규칙(테넌트 + IP)이
  그 플러그인의 `keyGenerator` 로는 안 잡히고, 결국 같은 Lua 를 쓰게 된다.

## 검증

`pnpm test` 214개 통과 · `pnpm typecheck` · `pnpm lint` 통과.
`docker compose up redis` 로 띄우고 2인스턴스에서 실제로 429 가 한 번만 나가는 것 확인.
