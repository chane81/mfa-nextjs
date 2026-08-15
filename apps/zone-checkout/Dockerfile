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
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm turbo run build --filter=@mfa/zone-checkout

# Next 파일 트레이싱이 @swc/helpers 의 `esm/` 를 standalone 에 담지 않는다.
# pnpm 이 isolated 링커라 이 패키지가 next 의 중첩 node_modules 안 심링크로 들어가는데,
# 트레이서가 CJS 진입점만 따라가고 ESM 쪽 파일을 놓친다. 런타임에 이렇게 죽는다:
#   Cannot find module '.../@swc/helpers/esm/_interop_require_default.js'
# 스토어의 원본 패키지를 standalone 트리 위에 통째로 덮어써서 메운다.
RUN set -eu; \
    std="apps/zone-checkout/.next/standalone"; \
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
