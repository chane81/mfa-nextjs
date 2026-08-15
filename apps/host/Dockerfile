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
COPY packages/contracts/package.json packages/contracts/
COPY packages/eslint-config/package.json packages/eslint-config/
COPY packages/typescript-config/package.json packages/typescript-config/
COPY packages/ui/package.json packages/ui/
RUN --mount=type=cache,target=/pnpm/store,sharing=locked pnpm install --frozen-lockfile

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

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# ^build 의존성(@mfa/contracts, @mfa/ui)까지 turbo 가 알아서 먼저 빌드한다
RUN pnpm turbo run build --filter=@mfa/host

# Next 파일 트레이싱이 @swc/helpers 의 `esm/` 를 standalone 에 담지 않는다.
# pnpm 이 isolated 링커라 이 패키지가 next 의 중첩 node_modules 안 심링크로 들어가는데,
# 트레이서가 CJS 진입점만 따라가고 ESM 쪽 파일을 놓친다. 런타임에 이렇게 죽는다:
#   Cannot find module '.../@swc/helpers/esm/_interop_require_default.js'
# 스토어의 원본 패키지를 standalone 트리 위에 통째로 덮어써서 메운다.
RUN set -eu; \
    std="apps/host/.next/standalone"; \
    src="$(find /repo/node_modules/.pnpm -maxdepth 4 -type d -path '*/@swc/helpers' | head -1)"; \
    test -n "$src"; \
    found=0; \
    for dst in "$std"/node_modules/.pnpm/*/node_modules/@swc/helpers; do \
      [ -d "$dst" ] || continue; \
      cp -R "$src"/. "$dst"/; \
      found=1; \
    done; \
    if [ "$found" = 0 ]; then \
      for nextdir in "$std"/node_modules/.pnpm/next@*/node_modules; do \
        [ -d "$nextdir" ] || continue; \
        mkdir -p "$nextdir/@swc/helpers"; \
        cp -R "$src"/. "$nextdir/@swc/helpers"/; \
        found=1; \
      done; \
    fi; \
    test "$found" = 1

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
