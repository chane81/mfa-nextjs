import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { REMOTE_LIST } from '@mfa/remote-config';
import { EXPOSE_SCAN, readExposes } from '@mfa/remote-config/node';
import { describe, expect, it } from 'vitest';

import { MODULE_IDS } from '../packages/contracts/src/generated/module-ids';

/**
 * **커밋된 `MODULE_IDS` 가 지금 `src/exposes/` 와 같은가.**
 *
 * ## 왜 필요한가 — 잊는 자리가 옮겨갔다
 *
 * 모듈을 추가할 때 등록하는 자리는 없어졌다. 대신 `pnpm mf:types` 를 돌리고 생성물을
 * 커밋하는 절차가 생겼고, **그걸 잊으면 로컬은 전부 초록이다.**
 *
 *   `pnpm typecheck` — `contract-check.ts` 가 생성된 `MODULE_IDS` 와 생성된 `RemoteKeys`
 *                      를 대조하는데 둘 다 똑같이 낡았으므로 일치한다
 *   `pnpm test`      — (이 파일이 없으면) 아무도 안 본다
 *
 * 그래서 push 하고 CI 가 remote 를 빌드해 `pnpm mf:types` 를 돌린 뒤 `git diff` 로
 * 잡을 때까지 모른다. 그 전 구조에서는 각 remote 의 `exposes/contract.test.ts` 가
 * 같은 실수를 로컬에서 초 단위로 잡았다 — 그 능력만 여기로 되찾아 온다.
 *
 * ## 왜 `scripts/` 인가
 *
 * 이 대조는 remote 안에 둘 수 없다. 거기 두면 `@mfa/contracts` 를 import 하게 되고,
 * 그 패키지가 MF DTS(= remote 빌드 산출물)를 읽는 지금은 **remote 가 자기 산출물을
 * 요구하는 순환**이 된다. `scripts/` 는 어느 remote 의 빌드 그래프에도 없다.
 *
 * 짝은 `scripts/gen-module-ids.ts` 다 — 그 스크립트가 만든 것을 여기서 검사한다.
 *
 * ## 무엇을 안 보나
 *
 * **props 는 안 본다.** 그건 컴파일러가 host 의 호출부에서 본다. 여기서 보는 건
 * "목록이 낡았는가" 하나고, 네트워크도 remote 기동도 빌드도 필요 없다 —
 * 디렉터리와 커밋된 파일만 읽는다.
 */
const ROOT = fileURLToPath(new URL('..', import.meta.url));

/** 각 remote 의 `src/exposes/` 를 **빌드 설정과 같은 인자로** 스캔한 결과 */
function scannedModuleIds(): string[] {
  return REMOTE_LIST.flatMap(({ name, workspaceDir }) => {
    const { exposes } = readExposes(EXPOSE_SCAN.dir, {
      ignore: EXPOSE_SCAN.ignore,
      cwd: join(ROOT, workspaceDir),
    });

    // `./ProductGrid` → `catalog/ProductGrid`
    return Object.keys(exposes).map(
      (key) => `${name}/${key.slice('./'.length)}`,
    );
  }).sort();
}

describe('생성된 MODULE_IDS', () => {
  it('지금 `src/exposes/` 에 있는 파일들과 정확히 같다', () => {
    // 어긋나는 방향이 둘이고 원인이 하나다 — `pnpm mf:types` 를 안 돌렸다.
    //   목록에 없는데 파일이 있다   expose 를 추가하고 갱신을 잊었다
    //   목록에 있는데 파일이 없다   expose 를 지우거나 이름을 바꾸고 갱신을 잊었다
    expect([...MODULE_IDS].sort()).toEqual(scannedModuleIds());
  });

  it('접두사가 전부 실제 remote 이름이다', () => {
    const names = REMOTE_LIST.map((remote) => remote.name);

    for (const id of MODULE_IDS) {
      expect(names).toContain(id.split('/')[0]);
    }
  });
});
