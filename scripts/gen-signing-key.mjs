#!/usr/bin/env node
/**
 * remote 매니페스트 서명용 Ed25519 키쌍을 만든다.
 *
 * 개인키는 **remote 빌드 파이프라인**이, 공개키는 **host 배포**가 들고 있어야 한다.
 * 둘이 같은 곳에 있으면 서명이 막으려던 것(오리진 탈취)을 못 막는다.
 *
 *   remote CI :  MF_SIGNING_KEY=<private>
 *   host      :  MF_REMOTE_PUBLIC_KEY=<public>  MF_REQUIRE_SIGNATURE=1
 *
 * 사용: node scripts/gen-signing-key.mjs
 */
import { generateKeyPairSync } from 'node:crypto';

const { publicKey, privateKey } = generateKeyPairSync('ed25519');

const priv = privateKey
  .export({ type: 'pkcs8', format: 'der' })
  .toString('base64');
const pub = publicKey
  .export({ type: 'spki', format: 'der' })
  .toString('base64');

console.log(`# remote 빌드 파이프라인에만 둔다\nMF_SIGNING_KEY=${priv}\n`);
console.log(
  `# host 배포에 둔다\nMF_REMOTE_PUBLIC_KEY=${pub}\nMF_REQUIRE_SIGNATURE=1`,
);
