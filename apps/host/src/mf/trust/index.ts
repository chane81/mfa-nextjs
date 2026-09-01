import { REMOTE_NAMES, type RemoteName } from '@mfa/contracts';

import { ssrOrigin } from '../config';

/**
 * 서명 페이로드 직렬화는 **여기서 정의하지 않는다.**
 *
 * 서명하는 쪽은 remote 의 빌드 파이프라인(`scripts/stamp-remote-version.ts`)이고
 * 검증하는 쪽이 여기다. 두 파일이 각자 배열을 적으면 갈라졌을 때 증상이 나쁘다 —
 * 매니페스트는 멀쩡히 만들어지고 배포도 성공하는데 **검증만 실패**하고, 원인이
 * 두 파일의 차이라는 게 로그에 안 남는다. 원본은 배치 SSOT 인 `@mfa/remote-config` 다.
 *
 * 소비처 편의를 위해 여기서 다시 내보낸다 — 이 모듈을 쓰는 쪽은 신뢰 검사 함수들과
 * 이 직렬화를 거의 항상 같이 쓴다.
 */
export { signedPayload, type SignedManifestFields } from '@mfa/remote-config';

/**
 * remote 신뢰 경계.
 *
 * host **서버**가 remote 의 코드를 받아 `new Function` 으로 실행한다. 브라우저에서 remote
 * 청크를 실행하는 것과 신뢰 수준은 같지만, 뚫렸을 때 영향 범위가 서버 프로세스라는 점이 다르다.
 * 그래서 "어디서 받는지"와 "받은 게 맞는지"를 로드 전에 확정한다.
 *
 * 세 겹이다. 뒤로 갈수록 강하고, 앞의 것 없이는 뒤의 것도 의미가 없다.
 *
 *   1. **오리진 허용 목록** — 애초에 아무 데서나 받지 않는다.
 *      `mf-version.json` 은 remote 가 주는 값이라, 거기 담긴 경로를 그대로 믿으면
 *      "다른 오리진에서 받아 실행하라"는 지시를 그대로 따르게 된다.
 *   2. **경로 형태 검증** — 버전 디렉터리 안의 알려진 파일명만 허용한다.
 *      절대 URL·상위 경로 탈출·쿼리를 막는다.
 *   3. **무결성/서명** — 받은 바이트가 공표된 해시와 같은지, 그 해시를 담은 매니페스트가
 *      우리가 아는 키로 서명됐는지 확인한다.
 *
 * `node:crypto` 를 쓰지 않는다. 이 모듈은 client component 트리에서 import 되어
 * 브라우저 번들에도 포함되기 때문이다. WebCrypto 는 양쪽에 다 있다.
 */

/**
 * 허용 오리진.
 *
 * 명시하지 않으면 설정된 remote 오리진만 허용한다. 즉 기본값이 이미 닫혀 있고,
 * 프록시·CDN 을 따로 쓸 때만 `REMOTE_ALLOWED_ORIGINS` 로 넓힌다.
 *
 * 기본값을 인자로 받는 **순수 함수**다. 이 저장소에서 그 기본값은 언제나
 * `trustedOrigins()` 가 정하지만, 둘을 나눠 두면 "env 파싱 규칙"만 따로 시험할 수 있다.
 */
export function allowedOrigins(defaults: string[]): string[] {
  const configured = process.env.REMOTE_ALLOWED_ORIGINS;
  if (!configured) return defaults;

  return configured
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
    .map((origin) => new URL(origin).origin);
}

/**
 * **이 host 가 remote 바이트를 받아도 되는 오리진.** 신뢰 판단의 창구는 여기 하나다.
 *
 * 기본값이 `SSR_ENTRIES` 의 오리진이라 **서버에서만 의미가 있다.** 브라우저 번들에서는
 * `publicOrigin` 이 치환되지 않아 `localhost` 목록이 나오는데, remote 바이트를 받아
 * 실행하는 경로가 서버뿐이라 브라우저는 이 값을 부르지 않는다.
 */
export function trustedOrigins(): string[] {
  return allowedOrigins(REMOTE_NAMES.map((remote) => ssrOrigin(remote)));
}

export function assertAllowedOrigin(
  remote: RemoteName,
  url: string,
  allowed: string[],
): void {
  let origin: string;
  try {
    origin = new URL(url).origin;
  } catch {
    throw new Error(`remote '${remote}' 의 URL 을 해석할 수 없습니다: ${url}`);
  }

  if (!allowed.includes(origin)) {
    throw new Error(
      `remote '${remote}' 의 오리진이 허용 목록에 없습니다: ${origin} (허용: ${allowed.join(', ')})`,
    );
  }
}

/**
 * 매니페스트가 준 **버전 문자열**이 안전한지.
 *
 * 이 값은 remote 가 주는 것이고, 검증 없이 세 군데로 흘러간다 —
 * 자산 경로(`/v<version>/`), 캐시 키, 그리고 브라우저로 심는 인라인 스크립트
 * (`RemoteVersionSync`). 마지막이 문제다: 거기서 쓰는 `JSON.stringify` 는
 * `<` 와 `/` 를 이스케이프하지 않으므로, `version` 에 `</script>` 가 들어오면
 * 스크립트 태그를 빠져나온다.
 *
 * `assertSafeEntryPath` 는 이걸 못 막는다. 그건 경로가 `/v<version>/` 로 시작하는지만
 * 보는데, 매니페스트를 쓰는 쪽이 버전과 경로를 **같이** 정하므로 항상 통과한다.
 *
 * 그래서 형식을 여기서 좁힌다. `mf-build-version.ts` 가 만드는 값은
 * `t<base36>`(예: `tmsy012z5`)이고, 아래 범위는 그보다 넉넉하다 — 나중에 버전 체계를
 * 바꿔도 하이픈·점 정도는 통과한다. 대신 `< > / " '` 와 공백은 절대 안 들어온다.
 */
const SAFE_VERSION = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

export function assertSafeVersion(remote: RemoteName, version: string): void {
  if (!SAFE_VERSION.test(version)) {
    throw new Error(
      `remote '${remote}' 의 버전 문자열이 허용되지 않습니다: ${JSON.stringify(version).slice(0, 80)}`,
    );
  }
}

/**
 * 매니페스트가 준 엔트리 경로가 안전한지.
 *
 * 허용: `/v<version>/<파일명>` — 버전 디렉터리 안의 단일 파일.
 * 막는 것: 절대 URL(`https://evil/...`), 프로토콜 상대(`//evil/...`), 상위 경로(`..`),
 * 버전 불일치(공표한 버전과 다른 디렉터리), 쿼리·프래그먼트.
 */
export function assertSafeEntryPath(
  remote: RemoteName,
  path: string,
  version: string,
): void {
  const expected = `/v${version}/`;

  if (!path.startsWith(expected) || path.includes('..') || /[?#]/.test(path)) {
    throw new Error(
      `remote '${remote}' 의 엔트리 경로가 허용되지 않습니다: ${path}`,
    );
  }

  const file = path.slice(expected.length);
  if (!/^[\w.-]+$/.test(file)) {
    throw new Error(
      `remote '${remote}' 의 엔트리 파일명이 허용되지 않습니다: ${file}`,
    );
  }
}

const encoder = new TextEncoder();

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** SRI 형식(`sha384-<base64>`) 무결성 값을 만든다 */
export async function computeIntegrity(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-384', bytes);
  return `sha384-${toBase64(new Uint8Array(digest))}`;
}

/**
 * 받은 바이트가 공표된 해시와 같은지 확인한다.
 *
 * 서명 없이 이것만 있으면 "같은 출처가 준 값끼리의 대조"라 자기 증명에 가깝다.
 * 그래도 배포 도중 잘린 파일이나 버전 경로만 오염된 캐시는 잡는다.
 */
export async function assertIntegrity(
  remote: RemoteName,
  bytes: ArrayBuffer,
  expected: string | undefined,
): Promise<void> {
  if (!expected) {
    if (integrityRequired()) {
      /**
       * 로컬에서 이걸 만나는 경우는 대개 하나다 — 그 포트에 **dev 서버가 떠 있다.**
       * dev 는 `mf-version.json` 을 공표하지 않으므로(불변 경로를 안 쓴다) 버전도
       * 무결성도 없는 폴백 엔트리로 흘러온다. 힌트를 여기 붙여둔다.
       */
      throw new Error(
        `remote '${remote}' 매니페스트에 무결성 값이 없습니다. ` +
          `그 오리진에 dev 서버가 떠 있지 않은지 확인하세요 — 빌드는 dev 가 아니라 dist 를 서빙해야 합니다.`,
      );
    }
    return;
  }

  const actual = await computeIntegrity(bytes);
  if (actual !== expected) {
    throw new Error(
      `remote '${remote}' 번들 무결성 불일치 (공표=${expected.slice(0, 24)}…, 실제=${actual.slice(0, 24)}…)`,
    );
  }
}

/** 무결성 값이 없는 매니페스트를 거부할지 (기본: 프로덕션에서 거부) */
export function integrityRequired(): boolean {
  if (process.env.MF_REQUIRE_INTEGRITY === '0') return false;
  return process.env.NODE_ENV === 'production';
}

/** 서명 검증을 강제할지. 키 배포가 필요하므로 명시적으로 켠다. */
export function signatureRequired(): boolean {
  return process.env.MF_REQUIRE_SIGNATURE === '1';
}

/**
 * 매니페스트 서명을 검증한다.
 *
 * 공개키(`MF_REMOTE_PUBLIC_KEY`, base64 SPKI)는 host 가 배포 시점에 들고 있는 값이다.
 * 이게 있어야 "remote 오리진이 통째로 털린 경우"까지 막을 수 있다 —
 * 오리진이 주는 해시와 오리진이 주는 번들을 대조하는 것만으로는 못 막는다.
 */
export async function assertManifestSignature(
  remote: RemoteName,
  payload: string,
  signature: string | undefined,
): Promise<void> {
  const encoded = process.env.MF_REMOTE_PUBLIC_KEY;

  if (!encoded) {
    if (signatureRequired()) {
      throw new Error(
        `MF_REQUIRE_SIGNATURE=1 인데 MF_REMOTE_PUBLIC_KEY 가 없습니다 (remote '${remote}')`,
      );
    }
    return;
  }

  if (!signature) {
    if (signatureRequired()) {
      throw new Error(`remote '${remote}' 매니페스트에 서명이 없습니다`);
    }
    return;
  }

  const key = await crypto.subtle.importKey(
    'spki',
    fromBase64(encoded) as BufferSource,
    { name: 'Ed25519' },
    false,
    ['verify'],
  );

  const ok = await crypto.subtle.verify(
    'Ed25519',
    key,
    fromBase64(signature) as BufferSource,
    encoder.encode(payload) as BufferSource,
  );

  if (!ok) throw new Error(`remote '${remote}' 매니페스트 서명 검증 실패`);
}
