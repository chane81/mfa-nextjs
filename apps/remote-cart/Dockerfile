# syntax=docker/dockerfile:1
#
# remote-cart — Rsbuild 2(Rspack) + @module-federation/rsbuild-plugin
#
# 빌드 컨텍스트는 **저장소 루트**다.
#   docker build -f apps/remote-cart/Dockerfile .
#
# catalog 와 번들러만 다르고 배포 계약은 완전히 같다.
# 산출물 `dist/v<version>/` (웹 + mf-server.cjs) 를 serve-remote-dist.mjs 가 서빙한다.
#
# ## 빌드 시점에 굳는 값 (런타임 env 로 못 바꾼다)
#   REMOTE_CART_PUBLIC_URL — 자산 URL 접두사(assetPrefix). 절대 URL 이어야 한다.
#   MF_BUILD_VERSION       — 불변 경로 `/v<ver>/`.
#   MF_SIGNING_KEY         — 매니페스트 서명. build secret 으로 받는다.
ARG NODE_VERSION=22-slim

FROM node:${NODE_VERSION} AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN npm install -g pnpm@11.18.0
# Node 는 DNS 응답에서 AAAA 를 먼저 고른다. 이 호스트에서 IPv6 경로가 블랙홀이라
# registry.npmjs.org 연결이 에러도 없이 매달렸다(도커 이미지 pull 은 dockerd 라 무사했다).
ENV NODE_OPTIONS=--dns-result-order=ipv4first
WORKDIR /repo

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/host/package.json apps/host/
COPY apps/remote-cart/package.json apps/remote-cart/
COPY apps/remote-catalog/package.json apps/remote-catalog/
COPY apps/zone-checkout/package.json apps/zone-checkout/
COPY packages/contracts/package.json packages/contracts/
COPY packages/eslint-config/package.json packages/eslint-config/
COPY packages/typescript-config/package.json packages/typescript-config/
COPY packages/ui/package.json packages/ui/
# trustLockfile: 락파일이 이미 커밋·리뷰를 거쳤으므로 minimumReleaseAge / trustPolicy
# 재검증을 건너뛴다. 이 검증은 항목마다 레지스트리를 때려 빌드에 수 분을 얹는다.
# fetch* 는 느린 회선에서 한 번의 지연으로 install 전체가 죽지 않게 한다.
# 타임아웃을 더 늘리지는 않는다 — 늘리면 연결 불능이 '느림'처럼 보여 진단이 어려워진다.
RUN --mount=type=cache,target=/pnpm/store \
    pnpm install --frozen-lockfile \
      --config.trustLockfile=true \
      --config.fetchRetries=3 \
      --config.fetchTimeout=60000 \
      --config.fetchRetryMaxtimeout=180000

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
COPY --from=builder /repo/scripts/serve-remote-dist.mjs ./scripts/serve-remote-dist.mjs
COPY --from=builder /repo/scripts/docker/remote-entrypoint.sh ./scripts/remote-entrypoint.sh
RUN chmod +x ./scripts/remote-entrypoint.sh && mkdir -p /data && chown -R node:node /data /app

USER node
EXPOSE 3002
ENTRYPOINT ["/app/scripts/remote-entrypoint.sh"]
