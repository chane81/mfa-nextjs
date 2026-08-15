#!/bin/sh
#
# remote 컨테이너 진입점.
#
# ## 왜 이미지의 dist 를 그대로 서빙하지 않나
# 이 저장소의 remote 배포 계약은 **불변 아티팩트**다(scripts/stamp-remote-version.mjs 참고).
# `/v<ver>/...` 는 한 번 배포되면 내용이 바뀌지 않고, 롤백은 `mf-version.json` 만
# 옛 버전으로 되돌리면 끝나야 한다.
#
# 컨테이너는 휘발이라 이미지 안의 dist 만 서빙하면 재배포 순간 이전 버전이 사라진다.
# 그러면 (a) 롤백이 불가능하고, (b) 이미 캐시된 host HTML 이 참조하는 옛 청크가 404 가 된다.
#
# 그래서 영속 볼륨(`REMOTE_DIST_DIR`)에 **덧붙이는** 방식으로 서빙한다.
#   - 새 버전 디렉터리: 복사해 추가
#   - 기존 버전 디렉터리: 덮어쓰지 않는다 (`cp` 를 no-clobber 로)
#   - mf-version.json: 항상 덮어쓴다 — "지금 버전이 뭔지"는 최신이어야 한다
#
# 롤백: 볼륨의 mf-version.json 을 옛 버전 것으로 바꾸면 된다. 자산은 남아 있다.
set -eu

BUILD_DIST=/app/dist
DATA_DIR="${REMOTE_DIST_DIR:-/data}"
PORT="${PORT:-3001}"
KEEP="${REMOTE_KEEP_VERSIONS:-5}"

mkdir -p "$DATA_DIR"

# 버전 디렉터리는 추가만 한다. 기존 경로를 건드리면 불변성이 깨진다.
for dir in "$BUILD_DIST"/v*; do
  [ -d "$dir" ] || continue
  name=$(basename "$dir")
  if [ -d "$DATA_DIR/$name" ]; then
    echo "[entrypoint] $name 이미 있음 — 유지(불변)"
  else
    cp -R "$dir" "$DATA_DIR/$name"
    echo "[entrypoint] $name 배포"
  fi
done

# 현재 버전 공표는 항상 최신으로 교체한다
if [ -f "$BUILD_DIST/mf-version.json" ]; then
  cp -f "$BUILD_DIST/mf-version.json" "$DATA_DIR/mf-version.json"
else
  echo "[entrypoint] mf-version.json 이 이미지에 없습니다. stamp 단계를 확인하세요." >&2
  exit 1
fi

# 오래된 버전 정리. 0 이면 정리하지 않는다(볼륨 보존 정책을 외부에 맡기는 경우).
if [ "$KEEP" -gt 0 ]; then
  # shellcheck disable=SC2012 # mtime 정렬이 목적이라 ls -t 를 쓴다. 버전 문자열은 정렬 불가.
  ls -1dt "$DATA_DIR"/v*/ 2>/dev/null | tail -n "+$((KEEP + 1))" | while read -r stale; do
    rm -rf "$stale"
    echo "[entrypoint] 오래된 버전 정리: $(basename "$stale")"
  done
fi

exec node /app/scripts/serve-remote-dist.mjs "$PORT" "$DATA_DIR"
