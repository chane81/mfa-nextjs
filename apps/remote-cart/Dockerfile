# syntax=docker/dockerfile:1
#
# remote-cart — Rsbuild 2(Rspack) + @module-federation/rsbuild-plugin
#
# 빌드 컨텍스트는 **저장소 루트**다.
#   docker build -f apps/remote-cart/Dockerfile .
#
# catalog 와 번들러만 다르고 배포 계약은 완전히 같다.
# 산출물 `dist/v<version>/` (웹 + mf-server.cjs) 를 serve-remote-dist.ts 가 서빙한다.
#
# ## 빌드 시점에 굳는 값 (런타임 env 로 못 바꾼다)
#   REMOTE_CART_PUBLIC_URL — 자산 URL 접두사(assetPrefix). 절대 URL 이어야 한다.
#   MF_BUILD_VERSION       — 불변 경로 `/v<ver>/`.
#   MF_SIGNING_KEY         — 매니페스트 서명. build secret 으로 받는다.
ARG NODE_VERSION=24-slim

FROM node:${NODE_VERSION} AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN npm install -g pnpm@11.21.0
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
# cart 만 빌드하므로 host(next)와 catalog(vite)의 툴체인은 받지 않는다.
# 제외 필터라 루트 패키지는 남는다 — 루트 devDependency 인 turbo 가 필요하다.
# 여기서 빠지는 것: next(198M) + @next/swc(85M) + vite(2.3M) — 설치 기준
# 네트워크/공급망 설정은 base 스테이지의 pnpm_config_* 참고.
RUN --mount=type=cache,target=/pnpm/store,sharing=locked \
    pnpm install --frozen-lockfile \
      --filter '!@mfa/host' \
      --filter '!@mfa/remote-catalog'

FROM base AS builder
COPY --from=deps /repo/node_modules ./node_modules
COPY --from=deps /repo/apps ./apps
COPY --from=deps /repo/packages ./packages
COPY . .

ARG REMOTE_CART_PUBLIC_URL
ENV REMOTE_CART_PUBLIC_URL=${REMOTE_CART_PUBLIC_URL}

ARG MF_BUILD_VERSION
ENV MF_BUILD_VERSION=${MF_BUILD_VERSION}

ENV NODE_ENV=production

RUN --mount=type=secret,id=mf_signing_key \
    MF_SIGNING_KEY="$(cat /run/secrets/mf_signing_key 2>/dev/null || true)" \
    pnpm turbo run build --filter=@mfa/remote-cart

# ------------------------------------------------------------- runner
FROM node:${NODE_VERSION} AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3002
ENV REMOTE_DIST_DIR=/data

COPY --from=builder /repo/apps/remote-cart/dist ./dist
COPY --from=builder /repo/scripts/serve-remote-dist.ts ./scripts/serve-remote-dist.ts
COPY --from=builder /repo/scripts/docker/remote-entrypoint.sh ./scripts/remote-entrypoint.sh
RUN chmod +x ./scripts/remote-entrypoint.sh && mkdir -p /data && chown -R node:node /data /app

USER node
EXPOSE 3002
ENTRYPOINT ["/app/scripts/remote-entrypoint.sh"]
