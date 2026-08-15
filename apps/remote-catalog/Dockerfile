# syntax=docker/dockerfile:1
#
# remote-catalog — Vite 8 + @module-federation/vite
#
# 빌드 컨텍스트는 **저장소 루트**다.
#   docker build -f apps/remote-catalog/Dockerfile .
#
# 산출물은 웹 번들 + SSR(node) 번들 두 벌이고 전부 `dist/v<version>/` 아래로 나간다.
# 런타임은 Next 도 Vite 도 아니다 — scripts/serve-remote-dist.mjs 가 CDN 을 흉내내 서빙한다.
#
# ## 빌드 시점에 굳는 값 (런타임 env 로 못 바꾼다)
#   REMOTE_CATALOG_PUBLIC_URL — 자산 URL 접두사. host 가 다른 오리진에서 청크를 받으므로 절대 URL.
#   MF_BUILD_VERSION          — 불변 경로 `/v<ver>/` 를 정한다. 없으면 타임스탬프로 떨어진다.
#   MF_SIGNING_KEY            — 매니페스트 Ed25519 서명. 개인키라 build secret 으로 받는다.
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
RUN --mount=type=cache,target=/pnpm/store,sharing=locked pnpm install --frozen-lockfile

FROM base AS builder
COPY --from=deps /repo/node_modules ./node_modules
COPY --from=deps /repo/apps ./apps
COPY --from=deps /repo/packages ./packages
COPY . .

ARG REMOTE_CATALOG_PUBLIC_URL
ENV REMOTE_CATALOG_PUBLIC_URL=${REMOTE_CATALOG_PUBLIC_URL}

# .git 은 빌드 컨텍스트에 없다(.dockerignore). 커밋 SHA 를 버전으로 쓰려면 여기로 넘긴다.
ARG MF_BUILD_VERSION
ENV MF_BUILD_VERSION=${MF_BUILD_VERSION}

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
COPY --from=builder /repo/scripts/serve-remote-dist.mjs ./scripts/serve-remote-dist.mjs
COPY --from=builder /repo/scripts/docker/remote-entrypoint.sh ./scripts/remote-entrypoint.sh
RUN chmod +x ./scripts/remote-entrypoint.sh && mkdir -p /data && chown -R node:node /data /app

USER node
EXPOSE 3001
ENTRYPOINT ["/app/scripts/remote-entrypoint.sh"]
