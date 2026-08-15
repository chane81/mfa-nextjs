# syntax=docker/dockerfile:1
#
# zone-checkout — Next.js 16 / standalone (실험 B 대조군)
#
# 빌드 컨텍스트는 **저장소 루트**다.
#   docker build -f apps/zone-checkout/Dockerfile .
#
# 이 앱은 host 의 rewrite 뒤에 숨는다(basePath=/legacy-checkout).
# 직접 도메인을 붙일 필요는 없고, host 와 같은 네트워크에서 3003 으로 닿기만 하면 된다.
ARG NODE_VERSION=22-slim

FROM node:${NODE_VERSION} AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN npm install -g pnpm@11.18.0
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
# fetch* 는 느린 회선에서 install 이 통째로 죽는 걸 막는다(기본 타임아웃 60초).
RUN --mount=type=cache,target=/pnpm/store \
    pnpm install --frozen-lockfile \
      --config.trustLockfile=true \
      --config.fetchRetries=5 \
      --config.fetchTimeout=300000 \
      --config.fetchRetryMaxtimeout=180000

FROM base AS builder
COPY --from=deps /repo/node_modules ./node_modules
COPY --from=deps /repo/apps ./apps
COPY --from=deps /repo/packages ./packages
COPY . .
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm turbo run build --filter=@mfa/zone-checkout

FROM node:${NODE_VERSION} AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3003
ENV HOSTNAME=0.0.0.0

COPY --from=builder --chown=node:node /repo/apps/zone-checkout/.next/standalone ./
COPY --from=builder --chown=node:node /repo/apps/zone-checkout/.next/static ./apps/zone-checkout/.next/static

USER node
EXPOSE 3003
CMD ["node", "apps/zone-checkout/server.js"]
