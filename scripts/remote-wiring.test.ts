import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { REMOTE_LIST, REMOTES, type RemoteName } from '@mfa/remote-config';
import { describe, expect, it } from 'vitest';

/**
 * **remote 를 하나 더 추가할 때 잊는 자리들.**
 *
 * `@mfa/remote-config` 의 `REMOTES` 가 배치의 SSOT 다. 코드와 스크립트는 전부 거기서
 * 읽으므로 remote 가 늘어도 안 바뀐다 — CI 워크플로도, `serve-all-remotes` 도,
 * host 의 MF 런타임도 그렇다.
 *
 * 그런데 **선언 파일 셋은 그 SSOT 를 못 읽는다.**
 *
 *   turbo.json              JSON 이다. `dependsOn` 에 패키지 이름을 글자로 적어야 한다
 *   docker-compose.yml      YAML 이다. 반복문이 없다
 *   각 remote 의 Dockerfile  빌드 컨텍스트에 워크스페이스가 아직 없다
 *
 * 셋 다 **빠뜨려도 조용하다.** turbo 를 잊으면 host 프리렌더가 아직 빌드 안 된 remote 를
 * 받으러 가서 ECONNREFUSED 로 죽고(원인이 turbo.json 이라는 게 안 보인다), compose 를
 * 잊으면 로컬 도커에서 그 remote 만 없는 채로 host 가 뜨고, Dockerfile 의 제외 필터를
 * 잊으면 remote 이미지가 남의 툴체인까지 설치해 **몇 백 MB 씩 커진다.**
 *
 * 그래서 여기서 SSOT 와 대고 본다. 같은 방식의 검사가 이미 하나 있다 —
 * `docker-context.test.ts` 가 Dockerfile 의 워크스페이스 매니페스트 목록을 본다.
 */
const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));

const read = (rel: string): string =>
  readFileSync(resolve(REPO_ROOT, rel), 'utf8');

/**
 * turbo.json 은 JSONC 다(블록 주석이 설계 근거를 들고 있다). 주석을 걷어내고 읽는다.
 *
 * ⚠️ 정규식으로는 안 된다. 이 파일의 값에 `".next/**"` 같은 글롭이 있어서
 * `/\*[\s\S]*?\*\//` 가 **문자열 안의 `/**` 부터** 먹어버린다(실측: 그 아래 태스크가
 * 통째로 사라지고 JSON 파싱이 엉뚱한 자리에서 깨진다). 그래서 문자열 안팎을 구분하며
 * 한 글자씩 지나간다.
 */
function stripJsonc(text: string): string {
  let out = '';
  let inString = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]!;

    if (inString) {
      out += char;
      if (char === '\\') {
        out += text[i + 1] ?? '';
        i += 1;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      out += char;
      continue;
    }

    if (char === '/' && text[i + 1] === '*') {
      const end = text.indexOf('*/', i + 2);
      i = end === -1 ? text.length : end + 1;
      continue;
    }

    if (char === '/' && text[i + 1] === '/') {
      const end = text.indexOf('\n', i);
      i = end === -1 ? text.length : end - 1;
      continue;
    }

    out += char;
  }

  return out;
}

interface TurboConfig {
  tasks: Record<string, { dependsOn?: string[] } | undefined>;
}

const turbo = (): TurboConfig => {
  const parsed = JSON.parse(stripJsonc(read('turbo.json'))) as TurboConfig;
  if (!parsed.tasks) {
    throw new Error(
      'turbo.json 에서 `tasks` 를 찾지 못했습니다. 스키마가 바뀌었으면 이 파서를 같이 고치세요.',
    );
  }
  return parsed;
};

const compose = read('docker-compose.yml');

const dockerfile = (remote: RemoteName): string =>
  read(`${REMOTES[remote].workspaceDir}/Dockerfile`);

describe('turbo.json — host 빌드가 모든 remote 를 먼저 빌드한다', () => {
  /**
   * host 의 `next build` 는 순수 컴파일이 아니다. 프리렌더가 remote 의 SSR 번들을 HTTP 로
   * 받아 **실행한다**. 그래서 remote 의 dist 가 먼저 있어야 하고, 그 순서는 `dependsOn` 이
   * 유일하게 보장한다(`^build` 로는 안 된다 — host 는 remote 를 의존성으로 갖지 않는다.
   * 갖게 만들면 이 저장소가 증명하려는 독립 배포가 빌드 그래프에서 다시 묶인다).
   */
  it.each(REMOTE_LIST)(
    '$name 이 `@mfa/host#build` 에 걸려 있다',
    ({ packageName }) => {
      const dependsOn = turbo().tasks['@mfa/host#build']?.dependsOn ?? [];

      expect(
        dependsOn,
        `turbo.json 의 "@mfa/host#build".dependsOn 에 "${packageName}#build" 를 추가하세요.`,
      ).toContain(`${packageName}#build`);
    },
  );

  /**
   * 반대 방향도 본다. 지운 remote 가 남아 있으면 `turbo run build` 가 "그런 패키지 없음"
   * 으로 죽는데, 그 메시지만 보고는 turbo.json 이 원인이라는 게 잘 안 보인다.
   */
  it('없는 remote 가 남아 있지 않다', () => {
    const dependsOn = turbo().tasks['@mfa/host#build']?.dependsOn ?? [];
    const known = REMOTE_LIST.map(({ packageName }) => `${packageName}#build`);

    expect(
      dependsOn.filter((entry) => entry.startsWith('@mfa/remote-')),
    ).toEqual(known);
  });
});

describe('docker-compose.yml — 로컬 도커에 remote 가 다 있다', () => {
  it.each(REMOTE_LIST)(
    '$name 서비스가 자기 포트 · 오리진 env · 볼륨을 갖는다',
    ({ name, devPort, env }) => {
      const hint = `docker-compose.yml 에 remote '${name}' 배선을 추가하세요.`;

      expect(compose, hint).toContain(`  remote-${name}:`);
      expect(compose, hint).toContain(`'${devPort}:${devPort}'`);
      expect(compose, hint).toContain(`${name}-dist:`);
      // 빌드 인자(자산 URL 이 여기서 굳는다)와 host 런타임 env 에 둘 다 있어야 한다
      expect(
        compose.match(new RegExp(`${env.publicUrl}:`, 'g')) ?? [],
        hint,
      ).toHaveLength(3);
    },
  );

  it.each(REMOTE_LIST)(
    'host 가 $name 이 healthy 해질 때까지 기다린다',
    ({ name }) => {
      /**
       * host 는 뜨자마자 remote 의 SSR 번들을 받으러 간다. `depends_on` 이 없으면 그
       * 경주에서 host 가 이기고, 첫 페이지가 에러 박스로 그려진다.
       */
      expect(
        compose.split('depends_on:')[1] ?? '',
        `docker-compose.yml 의 host.depends_on 에 remote-${name} 을 추가하세요.`,
      ).toContain(`remote-${name}:`);
    },
  );
});

describe('Dockerfile — remote 이미지가 자기 것만 설치한다', () => {
  it.each(REMOTE_LIST)('$name 이 자기 포트로 뜬다', ({ name, devPort }) => {
    const text = dockerfile(name);

    expect(
      text,
      `${name} Dockerfile 의 PORT 를 ${devPort} 로 맞추세요.`,
    ).toContain(`ENV PORT=${devPort}`);
    expect(
      text,
      `${name} Dockerfile 의 EXPOSE 를 ${devPort} 로 맞추세요.`,
    ).toContain(`EXPOSE ${devPort}`);
  });

  /**
   * remote 이미지는 **자기 것만** 빌드하므로 남의 툴체인을 받지 않는다. 그 제외 목록은
   * remote 가 늘 때마다 **다른 모든 remote 의 Dockerfile 이 같이 늘어나는** 자리다 —
   * 이 저장소에서 remote 추가 비용이 유일하게 제곱으로 늘어나는 곳이라, 잊기도 쉽고
   * 잊어도 빌드는 성공한다(이미지만 커진다).
   */
  it.each(REMOTE_LIST)(
    '$name 이 host 와 다른 remote 를 설치하지 않는다',
    ({ name }) => {
      const text = dockerfile(name);
      const others = REMOTE_LIST.filter((remote) => remote.name !== name).map(
        ({ packageName }) => packageName,
      );

      for (const packageName of ['@mfa/host', ...others]) {
        expect(
          text,
          `${name} Dockerfile 의 deps 스테이지에 --filter '!${packageName}' 를 추가하세요.`,
        ).toContain(`--filter '!${packageName}'`);
      }
    },
  );

  it.each(REMOTE_LIST)(
    '$name 이 자기 패키지만 빌드한다',
    ({ name, packageName }) => {
      expect(dockerfile(name)).toContain(`--filter=${packageName}`);
    },
  );
});
