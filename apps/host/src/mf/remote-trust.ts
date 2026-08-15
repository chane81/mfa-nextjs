import type { RemoteName } from "@mfa/contracts";

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
 */
export function allowedOrigins(defaults: string[]): string[] {
  const configured = process.env.REMOTE_ALLOWED_ORIGINS;
  if (!configured) return defaults;

  return configured
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean)
    .map((origin) => new URL(origin).origin);
}

export function assertAllowedOrigin(remote: RemoteName, url: string, allowed: string[]): void {
  let origin: string;
  try {
    origin = new URL(url).origin;
  } catch {
    throw new Error(`remote '${remote}' 의 URL 을 해석할 수 없습니다: ${url}`);
  }

  if (!allowed.includes(origin)) {
    throw new Error(
      `remote '${remote}' 의 오리진이 허용 목록에 없습니다: ${origin} (허용: ${allowed.join(", ")})`,
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
export function assertSafeEntryPath(remote: RemoteName, path: string, version: string): void {
  const expected = `/v${version}/`;

  if (!path.startsWith(expected) || path.includes("..") || /[?#]/.test(path)) {
    throw new Error(`remote '${remote}' 의 엔트리 경로가 허용되지 않습니다: ${path}`);
  }

  const file = path.slice(expected.length);
  if (!/^[\w.-]+$/.test(file)) {
    throw new Error(`remote '${remote}' 의 엔트리 파일명이 허용되지 않습니다: ${file}`);
  }
}

const encoder = new TextEncoder();

function toBase64(bytes: Uint8Array): string {
  let binary = "";
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
  const digest = await crypto.subtle.digest("SHA-384", bytes);
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
  if (process.env.MF_REQUIRE_INTEGRITY === "0") return false;
  return process.env.NODE_ENV === "production";
}

/** 서명 검증을 강제할지. 키 배포가 필요하므로 명시적으로 켠다. */
export function signatureRequired(): boolean {
  return process.env.MF_REQUIRE_SIGNATURE === "1";
}

/**
 * 서명 대상 페이로드.
 *
 * 매니페스트 전체가 아니라 **신뢰 판단에 쓰이는 필드만** 고정 순서로 직렬화한다.
 * 필드가 늘어도 서명이 깨지지 않게 하려는 게 아니라, 서명이 무엇을 보장하는지
 * 읽는 사람이 한눈에 알게 하려는 것이다.
 */
export function signedPayload(fields: {
  remote: string;
  version: string;
  ssrEntry: string;
  webEntry: string;
  ssrIntegrity?: string;
  webIntegrity?: string;
}): string {
  return JSON.stringify([
    fields.remote,
    fields.version,
    fields.ssrEntry,
    fields.webEntry,
    fields.ssrIntegrity ?? "",
    fields.webIntegrity ?? "",
  ]);
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
    "spki",
    fromBase64(encoded) as BufferSource,
    { name: "Ed25519" },
    false,
    ["verify"],
  );

  const ok = await crypto.subtle.verify(
    "Ed25519",
    key,
    fromBase64(signature) as BufferSource,
    encoder.encode(payload) as BufferSource,
  );

  if (!ok) throw new Error(`remote '${remote}' 매니페스트 서명 검증 실패`);
}
