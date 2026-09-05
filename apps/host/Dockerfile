# syntax=docker/dockerfile:1
#
# host — Next.js 16 / Turbopack / standalone
#
# 빌드 컨텍스트는 **저장소 루트**다. pnpm 워크스페이스라 apps/host 만으로는 빌드할 수 없다.
#   docker build -f apps/host/Dockerfile .
#
# remote 매니페스트 URL 은 클라이언트 번들에 **구워진다**. 런타임 env 로는 못 바꾼다.
# 그래서 remote 오리진을 빌드 인자로 받는다.
ARG NODE_VERSION=24-slim

# ---------------------------------------------------------------- base
FROM node:${NODE_VERSION} AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
# packageManager 필드와 같은 버전으로 고정. corepack 대신 npm 설치를 쓰는 이유는
# 구형 Node 이미지의 corepack 서명 키가 최신 pnpm 을 거부하는 사고를 피하기 위함.
RUN npm install -g pnpm@12.1.0
# Node 는 DNS 응답에서 AAAA 를 먼저 고른다. 이 호스트에서 IPv6 경로가 블랙홀이라
# registry.npmjs.org 연결이 에러도 없이 매달렸다(도커 이미지 pull 은 dockerd 라 무사했다).
ENV NODE_OPTIONS=--dns-result-order=ipv4first
#
# pnpm 네트워크 설정. **환경변수로 준다** — `--config.<키>` CLI 형식은 값을 문자열로
# 흘려서 숫자 설정이 깨진다(실측):
#   [ERROR] Expected `concurrency` to be a number from 1 and up, got `8` (string)
# 문서화된 방식은 `pnpm_config_` 접두사 + snake_case 다. https://pnpm.io/configuring
#
# trust_lockfile — 공급망 검증 패스를 건너뛴다.
#   pnpm 11 이상의 minimumReleaseAge 기본값이 1440(하루)이라, --frozen-lockfile 이어도
#   설치마다 락파일 전체(454 entries)의 게시 시각을 registry 에 물어본다. 실측 2m43s.
#   락파일은 개발 머신과 CI 에서 이미 검증됐고 이 이미지는 그걸 물질화만 한다.
#   대신 **오염된 락파일은 여기서 못 걸러낸다** — 그 검증은 저장소 밖 기여자를 받는
#   시점에 저장소 쪽에서 해야 한다. https://pnpm.io/settings/dependency-resolution
#
# fetch_timeout — 기본 60s 로는 큰 tarball 을 못 받는다. 실측 실패 로그가 정확히
#   60.68 / 130.7 / 250.8 — 재시도 3번이 전부 60초에서 잘렸다. 걸린 건 next(198M),
#   @next/swc-linux-arm64-gnu(85M), @turbo/linux-arm64 뿐이고 작은 메타데이터 JSON 은
#   전부 통과했다. 즉 DNS 가 아니라 대역폭 문제다.
#
# network_concurrency — 기본은 워커 수에 따라 16~64 로 자동. 큰 tarball 이 동시에
#   대역폭을 나눠 가지면 전부 느려져 **다 같이** 타임아웃한다. 줄여서 순서대로 받게 한다.
ENV pnpm_config_trust_lockfile=true
ENV pnpm_config_fetch_timeout=600000
ENV pnpm_config_network_concurrency=8
WORKDIR /repo

# ------------------------------------------------------------- deps
# 매니페스트만 먼저 복사해 의존성 레이어를 소스 변경과 분리한다.
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/host/package.json apps/host/
COPY apps/remote-cart/package.json apps/remote-cart/
COPY apps/remote-catalog/package.json apps/remote-catalog/
# ⚠️ 워크스페이스 패키지를 **하나도 빠뜨리면 안 된다.** 빠뜨려도 `pnpm install` 은
# 성공한다 — pnpm 이 없는 디렉터리로 심링크를 먼저 만들기 때문이다. 대신 그 패키지의
# `node_modules` 가 안 생겨서, `COPY . .` 로 소스가 채워진 뒤 빌드가 그 패키지의
# 의존성을 못 푼다(`packages/store` → zustand, `packages/tailwind-config` → tailwindcss).
# 실제로 셋이 빠져 있었고 아무 검사도 그걸 못 봤다. 지금은 `scripts/docker-context.ts`
# 가 이 목록을 워크스페이스와 대조하고 `pnpm test` 에서 죽는다.
COPY packages/contracts/package.json packages/contracts/
COPY packages/eslint-config/package.json packages/eslint-config/
COPY packages/remote-config/package.json packages/remote-config/
COPY packages/store/package.json packages/store/
COPY packages/tailwind-config/package.json packages/tailwind-config/
COPY packages/typescript-config/package.json packages/typescript-config/
COPY packages/ui/package.json packages/ui/
# 이 이미지는 host 만 빌드하므로 remote 의 툴체인을 받을 이유가 없다.
# 제외 필터를 쓰면 **루트 패키지가 남는다** — 루트 devDependency 인 turbo 가 필요하기 때문이다.
# (`--filter '@mfa/host...'` 는 루트를 빼버려서 `pnpm turbo` 가 없어진다. 실측으로 확인)
# 여기서 빠지는 것: @rspack/binding(40M), @rsbuild/core(5.3M), vite(2.3M) — 설치 기준
# 네트워크/공급망 설정은 base 스테이지의 pnpm_config_* 참고.
RUN --mount=type=cache,target=/pnpm/store,sharing=locked \
    pnpm install --frozen-lockfile \
      --filter '!@mfa/remote-catalog' \
      --filter '!@mfa/remote-cart'

# ------------------------------------------------------------ builder
FROM base AS builder
COPY --from=deps /repo/node_modules ./node_modules
COPY --from=deps /repo/apps ./apps
COPY --from=deps /repo/packages ./packages
COPY . .

# remote 오리진. **remote 하나당 변수 하나**고, 여기서 세 가지가 파생된다.
#   - 브라우저 번들에 구워지는 매니페스트 URL  (…/mf-manifest.json)
#   - 프리렌더가 받아 실행하는 SSR 번들 URL     (…/mf-server.cjs)
#   - 오리진 허용 목록의 기본값
# 파일명 조립은 `@mfa/remote-config` 가 한다.
#
# 브라우저용 값은 클라이언트 번들에 **구워지므로** 런타임 env 로 못 바꾼다.
# SSR 쪽은 런타임 값이면서 **빌드 시점에도 필요하다** — 프리렌더가 remote 의 SSR 번들을
# 실제로 받아 실행하기 때문이다. 여기서 안 넘기면 빌드가 기본값(localhost:3001/3002)을
# 보고 아무것도 못 받아 실패한다. 그래서 런타임 env 에도 **같은 값을 그대로** 넣는다.
#
# 빈 값으로 도착해도 안전하도록 읽는 쪽은 `||` 로 폴백한다(`publicOrigin`).
ARG REMOTE_CATALOG_PUBLIC_URL
ARG REMOTE_CART_PUBLIC_URL
ENV REMOTE_CATALOG_PUBLIC_URL=${REMOTE_CATALOG_PUBLIC_URL}
ENV REMOTE_CART_PUBLIC_URL=${REMOTE_CART_PUBLIC_URL}

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# `build` 가 아니라 `docker:build` 다. 산출물은 같고 remote 게이트만 없다.
#
# 로컬 `build` 는 워크스페이스 remote 를 먼저 빌드해 띄운다. 이미지에서 remote 는 이미
# 배포된 공개 도메인이라 그럴 이유가 없고, 하면 catalog 빌드 실패가 host 배포까지 끌고
# 내려간다. 근거는 turbo.json 의 해당 태스크 주석.
#
# ^build 의존성(@mfa/contracts, @mfa/ui)은 turbo 가 알아서 먼저 빌드한다.
RUN pnpm turbo run docker:build --filter=@mfa/host

# @swc/helpers 의 `esm/` 이 standalone 에 실제로 담겼는지 확인한다.
#
# 파일 트레이싱이 이걸 빠뜨리면 빌드도 배포도 성공한 채로 컨테이너가 부팅에서 죽는다:
#   Cannot find module '.../@swc/helpers/esm/_interop_require_default.js'
# 담기게 하는 쪽은 next.config.ts 의 outputFileTracingIncludes 다. 여기서는 그게 먹었는지만 본다.
# Next 가 이 버그를 고쳐 include 가 필요 없어지든, 반대로 include 가 조용히 안 먹든,
# 배포된 뒤가 아니라 여기서 드러나야 한다.
RUN find apps/host/.next/standalone -path '*@swc/helpers/esm/_interop_require_default.js' | grep -q .

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
