// ⚠️ `./remote-contract` 는 여기 없다. 그 파일은 `../@mf-types`(remote 빌드 산출물)를
// 읽으므로, 배럴에 실으면 remote 가 어휘를 가져다 쓸 때마다 자기 산출물을 요구하게 된다.
// `@mfa/contracts/remote` 라는 별도 진입점으로만 나간다 — 근거는 그 파일 머리말.
export * from './cart';
export * from './product';

/**
 * remote 이름은 배럴에도 둔다.
 *
 * 원본은 `@mfa/remote-config`(포트·env 와 같은 자리)고 여기는 통로다. 이 값을 쓰는
 * 자리가 모듈 계약과 무관한 곳에도 많다 — 버전 동기화, 진단, 캐시 무효화 라우트.
 * 그쪽까지 `@mfa/contracts/remote` 를 거치게 하면 **`@mf-types` 없이는 못 도는 코드**가
 * 이유 없이 늘어난다.
 */
export { REMOTE_NAMES, type RemoteName } from '@mfa/remote-config';
