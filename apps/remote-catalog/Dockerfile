# syntax=docker/dockerfile:1
#
# remote-catalog — Vite 8 + @module-federation/vite
#
# 빌드 컨텍스트는 **저장소 루트**다.
#   docker build -f apps/remote-catalog/Dockerfile .
#
# 산출물은 웹 번들 + SSR(node) 번들 두 벌이고 전부 `dist/v<version>/` 아래로 나간다.
# 런타임은 Next 도 Vite 도 아니다 — scripts/serve-remote-dist.ts 가 CDN 을 흉내내 서빙한다.
#
# ## 빌드 시점에 굳는 값 (런타임 env 로 못 바꾼다)
#   REMOTE_CATALOG_PUBLIC_URL — 자산 URL 접두사. host 가 다른 오리진에서 청크를 받으므로 절대 URL.
#   MF_SIGNING_KEY            — 매니페스트 Ed25519 서명. 개인키라 build secret 으로 받는다.
#
# 불변 경로 `/v<ver>/` 의 버전은 인자로 받지 않는다. `.git` 이 컨텍스트에 없어서
# 여기서는 타임스탬프로 정해진다 — 의도한 것이다(docs/03-setup/04-dokploy.md).
ARG NODE_VERSION=24-slim

FROM node:${NODE_VERSION} AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN npm install -g pnpm@12.1.0
# Node 는 DNS 응답에서 AAAA 를 먼저 고른다. 이 호스트에서 IPv6 경로가 블랙홀이라
# registry.npmjs.org 연결이 에러도 없이 매달렸다(도커 이미지 pull 은 dockerd 라 무사했다).
ENV NODE_OPTIONS=--dns-result-order=ipv4first
# pnpm 네트워크/공급망 설정. 각 값의 근거는 apps/host/Dockerfile 의 같은 블록에 있다.
# 요약: 환경변수로 줘야 한다(`--config.<키>` 는 숫자를 문자열로 흘려 깨진다),
#       trust_lockfile 로 매 설치 2m43s 짜리 공급망 재검증을 건너뛰고,
#       기본 60s fetch_timeout 으로는 큰 tarball 을 못 받는다.
ENV pnpm_config_trust_lockfile=true
ENV pnpm_config_fetch_timeout=600000
ENV pnpm_config_network_concurrency=8
WORKDIR /repo

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/host/package.json apps/host/
COPY apps/remote-cart/package.json apps/remote-cart/
COPY apps/remote-catalog/package.json apps/remote-catalog/
COPY packages/contracts/package.json packages/contracts/
COPY packages/eslint-config/package.json packages/eslint-config/
COPY packages/typescript-config/package.json packages/typescript-config/
COPY packages/ui/package.json packages/ui/
# catalog 만 빌드하므로 host(next)와 cart(rspack)의 툴체인은 받지 않는다.
# 제외 필터라 루트 패키지는 남는다 — 루트 devDependency 인 turbo 가 필요하다.
# 여기서 빠지는 것: next(198M) + @next/swc(85M) + @rspack/binding(40M) — 설치 기준
# 네트워크/공급망 설정은 base 스테이지의 pnpm_config_* 참고.
RUN --mount=type=cache,target=/pnpm/store,sharing=locked \
    pnpm install --frozen-lockfile \
      --filter '!@mfa/host' \
      --filter '!@mfa/remote-cart'

FROM base AS builder
COPY --from=deps /repo/node_modules ./node_modules
COPY --from=deps /repo/apps ./apps
COPY --from=deps /repo/packages ./packages
COPY . .

ARG REMOTE_CATALOG_PUBLIC_URL
ENV REMOTE_CATALOG_PUBLIC_URL=${REMOTE_CATALOG_PUBLIC_URL}

ENV NODE_ENV=production

# 서명 개인키는 ARG 로 받으면 이미지 히스토리에 남는다. BuildKit secret 으로만 받는다.
# 시크릿을 안 넘기면 서명 없이 빌드된다(무결성 SRI 는 그대로 유효).
# 그 경우 host 쪽 MF_REQUIRE_SIGNATURE 는 1 이면 안 된다.
RUN --mount=type=secret,id=mf_signing_key \
    MF_SIGNING_KEY="$(cat /run/secrets/mf_signing_key 2>/dev/null || true)" \
    pnpm turbo run build --filter=@mfa/remote-catalog

# ------------------------------------------------------------- runner
FROM node:${NODE_VERSION} AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3001
# 볼륨. 이전 배포의 `/v<ver>/` 를 보존해야 롤백과 캐시 정합성이 성립한다.
ENV REMOTE_DIST_DIR=/data

COPY --from=builder /repo/apps/remote-catalog/dist ./dist
COPY --from=builder /repo/scripts/serve-remote-dist.ts ./scripts/serve-remote-dist.ts
COPY --from=builder /repo/scripts/docker/remote-entrypoint.sh ./scripts/remote-entrypoint.sh
RUN chmod +x ./scripts/remote-entrypoint.sh && mkdir -p /data && chown -R node:node /data /app

USER node
EXPOSE 3001
ENTRYPOINT ["/app/scripts/remote-entrypoint.sh"]
