import { createPrivateKey, generateKeyPairSync, sign } from 'node:crypto';

/**
 * remote 매니페스트 서명 픽스처.
 *
 * 키 형식(개인키 pkcs8/der/base64, 공개키 spki/der/base64)과 서명 방식은
 * `scripts/gen-signing-key.ts` · `scripts/stamp-remote-version.ts` 와 **같아야 한다.**
 * 여기서 형식을 하나라도 바꾸면 테스트는 자기들끼리만 맞는 라운드트립이 되어,
 * 실제 파이프라인이 갈라져도 초록으로 통과한다.
 *
 * Node 24 는 WebCrypto Ed25519 를 네이티브로 지원하므로 host 쪽 검증도 모킹 없이 돈다.
 */
export interface SigningKeyPair {
  /** `MF_SIGNING_KEY` — remote 빌드 파이프라인에만 둔다 */
  privateKey: string;
  /** `MF_REMOTE_PUBLIC_KEY` — host 배포에 둔다 */
  publicKey: string;
}

export function generateSigningKeyPair(): SigningKeyPair {
  const pair = generateKeyPairSync('ed25519');
  return {
    privateKey: pair.privateKey
      .export({ type: 'pkcs8', format: 'der' })
      .toString('base64'),
    publicKey: pair.publicKey
      .export({ type: 'spki', format: 'der' })
      .toString('base64'),
  };
}

/** `scripts/stamp-remote-version.ts` 가 서명하는 방식 그대로 */
export function signPayload(payload: string, privateKey: string): string {
  const key = createPrivateKey({
    key: Buffer.from(privateKey, 'base64'),
    format: 'der',
    type: 'pkcs8',
  });
  return sign(null, Buffer.from(payload, 'utf8'), key).toString('base64');
}
