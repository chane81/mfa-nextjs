# syntax=docker/dockerfile:1
#
# host — Next.js 16 / Turbopack / standalone
#
# 빌드 컨텍스트는 **저장소 루트**다. pnpm 워크스페이스라 apps/host 만으로는 빌드할 수 없다.
#   docker build -f apps/host/Dockerfile .
#
# NEXT_PUBLIC_* 은 클라이언트 번들에 **구워진다**. 런타임 env 로는 못 바꾼다.
# 그래서 remote 매니페스트 URL 은 빌드 인자로 받는다.
ARG NODE_VERSION=22-slim

# ---------------------------------------------------------------- base
FROM node:${NODE_VERSION} AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
# packageManager 필드와 같은 버전으로 고정. corepack 대신 npm 설치를 쓰는 이유는
# 구형 Node 이미지의 corepack 서명 키가 최신 pnpm 을 거부하는 사고를 피하기 위함.
RUN npm install -g pnpm@11.18.0
# Node 는 DNS 응답에서 AAAA 를 먼저 고른다. 이 호스트에서 IPv6 경로가 블랙홀이라
# registry.npmjs.org 연결이 에러도 없이 매달렸다(도커 이미지 pull 은 dockerd 라 무사했다).
ENV NODE_OPTIONS=--dns-result-order=ipv4first
WORKDIR /repo

# ------------------------------------------------------------- deps
# 매니페스트만 먼저 복사해 의존성 레이어를 소스 변경과 분리한다.
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

# ------------------------------------------------------------ builder
FROM base AS builder
COPY --from=deps /repo/node_modules ./node_modules
COPY --from=deps /repo/apps ./apps
COPY --from=deps /repo/packages ./packages
COPY . .

# 브라우저 번들에 구워지는 값 (없으면 host 코드의 localhost 기본값이 들어간다)
ARG NEXT_PUBLIC_REMOTE_CATALOG_ENTRY
ARG NEXT_PUBLIC_REMOTE_CART_ENTRY
ENV NEXT_PUBLIC_REMOTE_CATALOG_ENTRY=${NEXT_PUBLIC_REMOTE_CATALOG_ENTRY}
ENV NEXT_PUBLIC_REMOTE_CART_ENTRY=${NEXT_PUBLIC_REMOTE_CART_ENTRY}

# zone rewrite 대상은 next.config.ts 가 빌드 시점에 읽는다
ARG ZONE_CHECKOUT_URL
ENV ZONE_CHECKOUT_URL=${ZONE_CHECKOUT_URL}

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# ^build 의존성(@mfa/contracts, @mfa/ui)까지 turbo 가 알아서 먼저 빌드한다
RUN pnpm turbo run build --filter=@mfa/host

# ------------------------------------------------------------- runner
FROM node:${NODE_VERSION} AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# standalone 산출물은 outputFileTracingRoot(= 저장소 루트) 구조를 그대로 미러링한다.
# 그래서 진입점이 /app/server.js 가 아니라 /app/apps/host/server.js 다.
COPY --from=builder --chown=node:node /repo/apps/host/.next/standalone ./
COPY --from=builder --chown=node:node /repo/apps/host/.next/static ./apps/host/.next/static

USER node
EXPOSE 3000
CMD ["node", "apps/host/server.js"]
