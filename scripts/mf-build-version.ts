#!/usr/bin/env node
/**
 * 빌드 버전을 정해 `.mf-version` 에 적는다. 빌드 **전에** 실행된다.
 *
 * ## 왜 내용 해시가 아니라 빌드 ID 인가
 * 자산 URL 접두사(`base` / `assetPrefix`)는 빌드가 시작되기 전에 정해져야 하는데,
 * 내용 해시는 빌드가 끝나야 나온다. 순환이라 해시로는 웹 자산을 버전 경로에 담을 수 없다.
 *
 * 대신 잃는 것: "내용이 같으면 버전도 같다". 변경 없이 재빌드하면 새 버전이 되어
 * host 가 한 번 헛 무효화한다(warm 1회 + 재생성 1회). 실제 CDN 배포가 다 이 방식이고,
 * 내용 해시는 `mf-version.json` 에 메타로 남겨 동일성 판단에 쓸 수 있게 한다.
 *
 * ## 왜 타임스탬프 하나뿐인가
 *
 * 이 값에 필요한 성질은 **"빌드마다 달라진다"** 하나다. host 는 `mf-version.json` 의
 * 버전이 바뀐 걸 보고 갈아타고, 자산은 그 값으로 만든 불변 경로에 담긴다.
 * 타임스탬프가 그 성질을 이미 만족한다.
 *
 * 한때 갈래가 셋이었다(`MF_BUILD_VERSION` → git SHA → 타임스탬프). 둘을 지웠다.
 *
 *   `MF_BUILD_VERSION`  넘기는 곳이 어디에도 없었다. Dockerfile `ARG` 가 빈 문자열만
 *                       흘려보냈고, 그 빈 값을 걸러내는 가드까지 달려 있었다. 버전을
 *                       고정해 재빌드할 일도 없다 — 롤백은 볼륨의 `mf-version.json` 을
 *                       되돌리는 것이지 재빌드가 아니다.
 *   git SHA             **컨테이너에서 애초에 동작하지 않는다.** `.git` 이 빌드 컨텍스트에
 *                       없고(`.dockerignore`), 베이스 이미지 `node:24-slim` 에 git
 *                       바이너리도 없다(실측). 로컬에서만 되는 갈래를 남겨두면 로컬과
 *                       배포의 버전 형태가 갈려서, 로컬에서 확인한 동작이 배포와 다르다.
 *
 * 잃는 것은 추적성이다 — `t1a2b3c4` 만 보고 어느 커밋인지 알 수 없다. 되찾으려면
 * `.git` 을 컨텍스트에 넣고 `.git/HEAD` 를 직접 읽는 경로를 만들어야 한다
 * (git 바이너리가 없으므로 `git rev-parse` 로는 안 된다). 배경: docs/03-setup/04-dokploy.md
 *
 * ## ⚠️ 이 값은 "배포가 끝났다" 는 신호가 아니다
 *
 * "빌드마다 달라진다" 는 성질은 **이 스크립트가 실제로 돌 때만** 성립한다. 컨테이너
 * 빌드에서는 이 실행이 Docker 레이어라, 빌드 컨텍스트가 이전과 같으면 레이어째 캐시로
 * 재사용되어 `.mf-version` 이 그대로다. 배포는 성공인데 버전은 안 바뀐다.
 *
 * 그래서 배포 파이프라인(`.github/actions/dokploy-deploy`)은 완료를 **Dokploy 의 배포
 * 상태**로 판정한다. 여기서 나온 버전 변화로 판정하면 캐시가 히트한 배포에서 영영
 * 기다리게 된다 — 실측으로 밟았다(known-issues I-8).
 *
 * 사용: node scripts/mf-build-version.ts
 */
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

/** base36 이라 짧고, 자산 경로에 그대로 쓸 수 있는 문자만 나온다 */
const version = `t${Date.now().toString(36)}`;

writeFileSync(resolve(process.cwd(), '.mf-version'), `${version}\n`);
console.log(`[version] ${version}`);
