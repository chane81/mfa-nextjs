#!/usr/bin/env bash
#
# host 이미지를 로컬에서 빌드하고 실제로 부팅까지 시킨다.
#
#   bash scripts/docker-host-local.sh           # 빌드 → 실행 → 스모크 → 정리
#   bash scripts/docker-host-local.sh --keep    # 컨테이너를 남겨둔다
#   bash scripts/docker-host-local.sh --no-cache
#
# ## 왜 이게 필요한가
#
# host 빌드는 프리렌더 도중 remote 의 SSR 번들을 **HTTP 로 받아 실행**한다.
# 그래서 이미지를 만드는 시점에 remote 오리진이 살아 있어야 한다. 그런데 빌드 컨테이너는
# 호스트 네트워크에 없다. 그래서 이렇게 한다.
#
#   1. remote 를 로컬에서 빌드 (pnpm)
#   2. 그 dist 를 이 맥의 3001/3002 에 서빙 (모든 인터페이스에 바인딩된다)
#   3. 맥의 **LAN IP** 를 remote 오리진으로 넘긴다
#
# ## 왜 localhost 가 아니라 LAN IP 인가
#
# 같은 주소를 브라우저(맥)와 컨테이너(빌드·런타임)가 함께 읽는다. `localhost` 는 컨테이너
# 안에서 자기 자신이고, `host.docker.internal` 은 맥에서 안 풀린다. **양쪽에서 같은 곳을
# 가리키는 주소는 LAN IP 뿐이다.** 덕분에 remote 당 환경변수가 하나로 끝난다 — 예전에는
# 이 자리 때문에 브라우저용과 SSR 용 변수를 따로 뒀다.
#
# 네트워크를 바꾸면 IP 가 바뀐다. 이미지에 구워진 값이라 그때는 다시 빌드해야 한다.
#
# 배포에서는 이 자리가 공개 도메인이라 이런 다리가 필요 없다.
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO"

IMAGE=mfa-host:local
CONTAINER=mfa-host-local
KEEP=0
BUILD_FLAGS=()

for arg in "$@"; do
  case "$arg" in
    --keep) KEEP=1 ;;
    --no-cache) BUILD_FLAGS+=(--no-cache) ;;
    *) echo "알 수 없는 인자: $arg"; exit 2 ;;
  esac
done

# macOS 기본 bash 는 3.2 다. `set -u` 에서 빈 배열을 `"${arr[@]}"` 로 펼치면
# "unbound variable" 로 죽는다. `${arr[@]+...}` 형태만 3.2 에서 안전하다.
PIDS=()
cleanup() {
  for pid in ${PIDS[@]+"${PIDS[@]}"}; do kill "$pid" 2>/dev/null || true; done
  if [ "$KEEP" = 0 ]; then
    docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

say() { printf '\n\033[1;36m▸ %s\033[0m\n' "$*"; }

# ---------------------------------------------------------------- 0. 사전 확인
docker info >/dev/null 2>&1 || { echo "docker 가 안 떠 있다"; exit 1; }

# 맥의 LAN IP. 브라우저와 컨테이너가 **같이** 읽는 주소라 루프백으로는 안 된다.
# 조용히 빈 값으로 흘리면 오리진이 `http://:3001` 이 되어 원인이 안 보이므로 여기서 죽인다.
HOST_IP="${MFA_HOST_IP:-$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || true)}"
if [ -z "$HOST_IP" ]; then
  echo "맥의 LAN IP 를 못 구했다 (en0/en1). 네트워크에 연결돼 있어야 한다."
  echo "  직접 지정: MFA_HOST_IP=192.168.0.10 bash scripts/docker-host-local.sh"
  exit 1
fi
CATALOG_URL="http://$HOST_IP:3001"
CART_URL="http://$HOST_IP:3002"
echo "remote 오리진: $CATALOG_URL / $CART_URL"

for port in 3001 3002; do
  if lsof -nP -iTCP:$port -sTCP:LISTEN -t >/dev/null 2>&1; then
    echo "포트 $port 를 이미 누가 쓰고 있다. dev 서버가 떠 있으면 내리고 다시 실행할 것."
    echo "  lsof -nP -iTCP:$port -sTCP:LISTEN"
    exit 1
  fi
done

# ---------------------------------------------------------------- 1. remote 빌드
#
# remote 산출물의 자산 URL 접두사도 같은 오리진으로 굳힌다. 여기서 안 넘기면 청크가
# `localhost:3001` 을 가리켜 브라우저에서는 우연히 동작하지만, host 가 보는 오리진과
# 달라져서 "어디서 무엇을 받는지"가 배포와 다른 모양이 된다.
say "remote 빌드"
REMOTE_CATALOG_PUBLIC_URL="$CATALOG_URL" \
REMOTE_CART_PUBLIC_URL="$CART_URL" \
  pnpm turbo run build --filter=@mfa/remote-catalog --filter=@mfa/remote-cart

for d in apps/remote-catalog/dist apps/remote-cart/dist; do
  [ -f "$d/mf-version.json" ] || { echo "$d/mf-version.json 이 없다"; exit 1; }
done

# ---------------------------------------------------------------- 2. dist 서빙
say "remote dist 서빙 (3001 / 3002)"
node scripts/serve-remote-dist.ts 3001 apps/remote-catalog/dist >/dev/null 2>&1 &
PIDS+=($!); disown %% 2>/dev/null || true
node scripts/serve-remote-dist.ts 3002 apps/remote-cart/dist >/dev/null 2>&1 &
PIDS+=($!); disown %% 2>/dev/null || true

PROBE="$(mktemp -t mfa-probe).mjs"
cat > "$PROBE" <<'EOF'
const [url, tries] = [process.argv[2], Number(process.argv[3] ?? 40)];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
for (let i = 0; i < tries; i++) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
    if (res.ok) { console.log(`ok ${url}`); process.exit(0); }
  } catch {}
  await sleep(500);
}
console.error(`실패 ${url}`);
process.exit(1);
EOF
node "$PROBE" http://localhost:3001/mf-version.json
node "$PROBE" http://localhost:3002/mf-version.json

# ---------------------------------------------------------------- 3. 이미지 빌드
#
# remote 당 인자 하나다. 브라우저용 매니페스트 URL 과 프리렌더가 받아가는 SSR 번들 URL 이
# 둘 다 여기서 파생된다(`@mfa/remote-config` 가 파일명을 붙인다).
say "이미지 빌드"
docker build \
  -f apps/host/Dockerfile \
  ${BUILD_FLAGS[@]+"${BUILD_FLAGS[@]}"} \
  --build-arg REMOTE_CATALOG_PUBLIC_URL="$CATALOG_URL" \
  --build-arg REMOTE_CART_PUBLIC_URL="$CART_URL" \
  -t "$IMAGE" .

# ---------------------------------------------------------------- 4. 실행
#
# 브라우저용 값은 이미 번들에 구워졌다. 여기서 다시 넘기는 건 host **서버**가 런타임에
# SSR 번들을 받아갈 때 쓰는 쪽이다 — 같은 변수, 같은 값.
say "컨테이너 실행"
docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
docker run -d --name "$CONTAINER" \
  -p 3000:3000 \
  -e REMOTE_CATALOG_PUBLIC_URL="$CATALOG_URL" \
  -e REMOTE_CART_PUBLIC_URL="$CART_URL" \
  -e MF_REVALIDATE_SECRET=local-secret \
  "$IMAGE" >/dev/null

# ---------------------------------------------------------------- 5. 스모크
say "스모크"
if ! node "$PROBE" http://localhost:3000/ 60; then
  echo
  echo "부팅 실패. 컨테이너 로그:"
  docker logs "$CONTAINER" 2>&1 | tail -30
  exit 1
fi

cat > "$PROBE" <<'EOF'
const html = await (await fetch("http://localhost:3000/checkout")).text();
const home = await (await fetch("http://localhost:3000/")).text();
console.log(`GET /checkout  주문서 SSR: ${html.includes("주문서") ? "O ✅" : "X ❌"}`);
console.log(`GET /          ErrorBox : ${home.includes("불러오지 못했습니다") ? "있음 ❌" : "없음 ✅"}`);
const pin = home.match(/http:\/\/[^"']+\/v[\w.-]+\/mf-manifest\.json/);
console.log(`서버가 심은 엔트리: ${pin ? pin[0] : "(못 찾음)"}`);
EOF
node "$PROBE"

say "이미지 안에 @swc/helpers/esm 이 들어갔는지"
docker run --rm --entrypoint sh "$IMAGE" -c \
  'find / -path "*@swc/helpers/esm/_interop_require_default.js" 2>/dev/null | head -1' \
  | grep -q . && echo "  있음 ✅" || echo "  없음 ❌"

if [ "$KEEP" = 1 ]; then
  echo
  echo "컨테이너를 남겨뒀다: http://localhost:3000"
  echo "  docker logs -f $CONTAINER"
  echo "  docker rm -f $CONTAINER"
  echo "※ remote 서빙(3001/3002)은 이 스크립트가 끝나면서 같이 내려간다."
  echo "  브라우저로 볼 거면 따로 띄울 것:"
  echo "    node scripts/serve-remote-dist.ts 3001 apps/remote-catalog/dist &"
  echo "    node scripts/serve-remote-dist.ts 3002 apps/remote-cart/dist &"
fi
