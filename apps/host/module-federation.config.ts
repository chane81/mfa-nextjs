import {
  MF_FILES,
  REMOTE_NAMES,
  publicOrigin,
  versionedPath,
  webManifestUrl,
  type RemoteName,
} from '@mfa/remote-config';

/**
 * host 의 **DTS 전용** Module Federation 설정.
 *
 * ## 이건 번들러 설정이 아니다
 *
 * 이 저장소의 host 에는 MF 번들러 플러그인이 없다 — Next 16 / Turbopack 은 MF 를 모르고,
 * 런타임(`@module-federation/runtime`)만 쓴다. 그 전제는 그대로다.
 * 이 파일을 읽는 건 **`mf dts` CLI 하나뿐**이고(`@module-federation/cli`), 하는 일은
 * "remote 의 타입 아카이브를 어디서 받아 어디에 풀지" 를 말해주는 것뿐이다.
 *
 * 그래서 `exposes` 도 `shared` 도 없다. 여기 있는 `remotes` 는 소비자 이름 목록의 의미고,
 * 실제 런타임 remote 목록은 여전히 `src/mf/loader/index.ts` 의 `init()` 이 쥔다.
 *
 * ## 왜 `.ts` 인가
 *
 * `mf dts` 는 config 를 jiti 로 읽는다(`@module-federation/cli` 의 `readConfig`).
 * 그래서 `@mfa/remote-config` 를 그대로 import 할 수 있고, remote 주소를 여기서
 * 다시 문자열로 적지 않아도 된다. SSOT 를 복제하지 않는다는 규칙이 이 파일에도 적용된다.
 *
 * ## 실행
 *
 *     pnpm --filter @mfa/host mf:types      # remote 가 떠 있어야 한다
 *
 * 결과는 `apps/host/@mf-types/` 에 풀리고 **저장소에 커밋된다.** host 소스가 그 타입을
 * 실제로 쓰기 때문이다(`src/mf/loader/modules.ts`) — 무시하면 `pnpm typecheck` 가
 * remote 기동을 요구하게 되고, 그건 이 저장소가 DTS 를 오래 껐던 바로 그 이유다.
 *
 * 그래서 이 명령은 **remote 를 고친 사람이 돌리는 것**이지 CI 의 기본 경로가 아니다.
 * 커밋된 타입이 낡았는지는 CI 가 빌드 뒤에 이걸 한 번 돌리고 `git diff` 로 본다.
 */

/**
 * remote 하나의 타입 URL 두 개.
 *
 * ⚠️ **버전 경로를 거쳐야 한다.** 배포된 remote 의 루트에는 `mf-version.json` 하나뿐이고
 * 나머지 자산은 전부 `/v<version>/` 아래에 있다(`stamp-remote-version.ts`).
 * 루트에서 zip 을 찾으면 404 인데, 그 응답에는 CORS 헤더가 없어서 콘솔에는
 * `Failed to fetch` 라는 네트워크 오류로만 보인다 — 원인이 URL 이라는 힌트가 안 나온다.
 *
 * dev 서버에는 버전 공표가 없다(일부러 404 다 — `createMfDevMiddleware`).
 * 그때는 버전 없는 루트 경로가 맞는 주소다.
 */
async function typeUrlsFor(remote: RemoteName) {
  const origin = publicOrigin(remote);
  const version = await announcedVersion(remote);

  return {
    alias: remote,
    api: `${origin}${versionedPath(MF_FILES.typesApi, version)}`,
    zip: `${origin}${versionedPath(MF_FILES.typesArchive, version)}`,
  };
}

/**
 * remote 가 **공표한** 버전. 없으면 `null`(dev).
 *
 * host 서버의 `src/mf/versions/server.ts` 와 같은 파일을 읽지만 그 코드를 부르지 않는다 —
 * 저쪽은 Next 서버 안에서 도는 신뢰 검증 · 캐시 태그까지 얽힌 경로고, 여기는 CLI 가
 * 한 번 부르는 빌드 도구다. 공유하면 CLI 가 Next 런타임을 끌고 오게 된다.
 */
async function announcedVersion(remote: RemoteName): Promise<string | null> {
  const url = `${publicOrigin(remote)}/${MF_FILES.versionManifest}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const body = (await res.json()) as { version?: string };
    return body.version ?? null;
  } catch {
    return null;
  }
}

export default {
  name: 'host',

  /**
   * 이름 → 매니페스트 URL. `mf dts` 가 alias 를 만들 때 이 키를 쓴다
   * (`@mf-types/<alias>/…`). 목록은 `@mfa/remote-config` 가 쥔다.
   */
  remotes: Object.fromEntries(
    REMOTE_NAMES.map((remote) => [
      remote,
      `${remote}@${webManifestUrl(remote)}`,
    ]),
  ),

  dts: {
    /** host 는 아무것도 노출하지 않는다 — 생산할 타입이 없다 */
    generateTypes: false,
    consumeTypes: {
      /**
       * 주소를 직접 준다. 매니페스트에서 유추하게 두면 zip 주소를 매니페스트 URL 기준으로
       * 조립하는데, 우리 remote 는 매니페스트가 `/v<ver>/` 아래라 그 유추가 어긋난다
       * (module-federation/core#4744 와 같은 갈래).
       */
      remoteTypeUrls: async () =>
        Object.fromEntries(
          await Promise.all(
            REMOTE_NAMES.map(async (remote) => [
              remote,
              await typeUrlsFor(remote),
            ]),
          ),
        ),
      /**
       * 못 받으면 **실패로 끝낸다.** 조용히 넘어가면 `@mf-types` 가 없거나 옛 상태인 채로
       * 남고, 대조 검사는 그걸 "계약과 일치" 로 읽는다 — 검증이 아니라 위약이 된다.
       */
      abortOnError: true,
      /** `RemoteKeys` · `PackageType` 까지 받는다 (`loadRemote()` 모듈 확장) */
      consumeAPITypes: true,
    },
  },
};
