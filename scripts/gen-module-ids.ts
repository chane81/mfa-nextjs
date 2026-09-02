#!/usr/bin/env node
/**
 * MF DTS 가 받아온 타입에서 **런타임 모듈 목록**을 만든다.
 *
 * ## 왜 필요한가 — 타입에서 값은 못 뽑는다
 *
 * `@mfa/contracts` 는 노출 모듈의 **타입**을 DTS 에서 받는다(`RemoteModuleId`).
 * 그런데 "노출 모듈이 몇 개인가" 를 코드가 물어보려면 런타임 배열이 있어야 하고,
 * 타입은 런타임에 없다. 그래서 그 배열만 손으로 적고 있었다.
 *
 * 손으로 적을 이유가 없다. **DTS 산출물이 이미 그 목록을 갖고 있다.**
 *
 *     // @mf-types/catalog/apis.d.ts
 *     export type RemoteKeys = 'catalog/ProductDetail' | 'catalog/ProductGrid';
 *
 * 그 리터럴을 뽑아 `.ts` 파일로 쓴다. remote 에 파일 하나를 놓으면 DTS 에 반영되고,
 * `pnpm mf:types` 가 여기까지 이어져 목록이 저절로 는다 — remote 의 공개 계약이
 * `src/exposes/` 디렉터리 하나로 정해진다는 규칙이 값까지 관통한다.
 *
 * ## 파싱이 깨지면 어떻게 되나
 *
 * `apis.d.ts` 의 포맷은 `@module-federation/dts-plugin` 의 것이라 버전이 오르면 바뀔 수
 * 있다. 그래서 이 스크립트를 **믿지 않는다.** 결과가 틀리면 `remote-contract.ts` 의
 * `ModuleIdsAreExhaustive` 가 컴파일 타임에 잡는다 — 생성된 배열과 `RemoteModuleId`
 * (같은 파일에서 타입으로 읽은 것)를 전수 대조하기 때문이다.
 *
 * 즉 이 스크립트는 편의고, 정확성은 타입 시스템이 보증한다.
 *
 * ## 출력은 커밋한다
 *
 * `@mf-types` 와 같은 정책이다. 생성물이지만 소스가 import 하므로 저장소에 있어야
 * `pnpm typecheck` 가 네트워크 없이 돈다. 낡았는지는 CI 가 `git diff` 로 본다.
 *
 * 둘 다 `packages/contracts/src/generated/` 한 폴더에 모여 있다 — 손으로 고치면 안 되는
 * 파일이 소스 사이에 섞이지 않게.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** `scripts/` 는 리포 루트 바로 아래라 이 파일 위치가 곧 기준점이다 */
const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));

const TYPES_DIR = resolve(
  REPO_ROOT,
  'packages/contracts/src/generated/@mf-types',
);
const OUT_FILE = resolve(
  REPO_ROOT,
  'packages/contracts/src/generated/module-ids.ts',
);

/**
 * `apis.d.ts` 한 장에서 노출 키를 뽑는다.
 *
 * `RemoteKeys` 선언 줄만 본다. 그 아래 `PackageType` 도 같은 리터럴을 반복하므로
 * 파일 전체에 정규식을 걸면 중복이 섞인다 — 줄을 먼저 좁힌다.
 */
function keysFrom(apisFile: string): string[] {
  const source = readFileSync(apisFile, 'utf8');
  const declaration = source.match(/export type RemoteKeys\s*=([^;]*);/);
  if (!declaration?.[1]) {
    throw new Error(
      `${apisFile} 에서 RemoteKeys 선언을 찾지 못했습니다. ` +
        'dts-plugin 의 출력 포맷이 바뀌었을 수 있습니다.',
    );
  }
  return [...declaration[1].matchAll(/'([^']+)'/g)].map((m) => m[1]!);
}

function collect(): string[] {
  if (!existsSync(TYPES_DIR)) {
    throw new Error(
      `${TYPES_DIR} 가 없습니다. 'pnpm mf:types' 를 먼저 돌리세요 (remote 기동 전제).`,
    );
  }

  const ids = readdirSync(TYPES_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(TYPES_DIR, entry.name, 'apis.d.ts'))
    .filter((file) => existsSync(file))
    .flatMap(keysFrom);

  if (ids.length === 0) {
    throw new Error(`${TYPES_DIR} 에서 노출 키를 하나도 찾지 못했습니다.`);
  }

  // 정렬해야 출력이 결정적이다. 디렉터리 순회 순서는 파일시스템에 좌우되고,
  // 그러면 아무것도 안 바뀌었는데 CI 의 `git diff` 검사가 깨진다.
  return [...new Set(ids)].sort();
}

const BANNER = `/**
 * ⚠️ **자동 생성 파일이다. 손으로 고치지 않는다.**
 *
 * \`pnpm mf:types\` 가 MF DTS 를 받아온 뒤 \`scripts/gen-module-ids.ts\` 로 만든다.
 * 원본은 각 remote 의 \`src/exposes/\` 디렉터리고, 그게 DTS 의 \`RemoteKeys\` 가 되어
 * 여기까지 온다.
 *
 * ## 왜 타입도 여기서 만드나
 *
 * \`RemoteModuleId\` 를 \`@mf-types\` 에서 직접 import 하면 그 참조가 emit 된
 * \`dist/remote-contract.d.ts\` 에 남는다. 그런데 \`.d.ts\` 는 tsc 가 \`dist\` 로
 * 복사하지 않으므로 소비처에서 그 경로가 풀리지 않고, \`skipLibCheck\` 때문에
 * **에러도 없이 \`any\` 가 된다**(실측). 계약이 조용히 사라지는 셈이다.
 *
 * 값에서 타입을 파생하면 emit 되는 선언에 외부 참조가 남지 않는다.
 * 이 배열이 실제 계약과 어긋나는지는 \`src/contract-check.ts\` 가 \`@mf-types\` 와
 * 대조한다 — 그 파일은 아무것도 export 하지 않아 \`d.ts\` 에 흔적을 남기지 않는다.
 */
`;

const ids = collect();
const body = ids.map((id) => `  '${id}',`).join('\n');
writeFileSync(
  OUT_FILE,
  `${BANNER}export const MODULE_IDS = [\n${body}\n] as const;\n\n` +
    '/** 노출 모듈 id. 위 배열에서 파생된다 — 값이 원본이고 타입이 그림자다. */\n' +
    'export type RemoteModuleId = (typeof MODULE_IDS)[number];\n',
  'utf8',
);

console.log(`[gen-module-ids] ${ids.length}개 → ${OUT_FILE}`);
