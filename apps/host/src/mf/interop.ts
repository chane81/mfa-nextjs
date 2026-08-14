/**
 * `import * as X from "..."` 의 결과 모양은 번들러/모드/대상(CJS·ESM)에 따라 달라진다.
 * 어떤 경우엔 `{ jsx, jsxs }`, 어떤 경우엔 CJS interop 때문에 `{ default: { jsx, jsxs } }` 다.
 *
 * 후자를 그대로 remote 에 넘기면 remote 안에서 `_jsxDEV is not a function` 같은 에러가 난다.
 * (Next dev 모드에서 실제 재현 → docs/05-troubleshooting)
 *
 * 기대하는 export 이름을 프로브로 넘기면 실제 모듈 객체를 찾아준다.
 */
export function normalizeModule<T>(mod: T, probe: string): T {
  const ns = mod as Record<string, unknown> | undefined;
  if (ns && typeof ns[probe] === "function") return mod;

  const inner = ns?.default as Record<string, unknown> | undefined;
  if (inner && typeof inner[probe] === "function") return inner as T;

  if (process.env.NODE_ENV !== "production") {
    console.warn(
      `[mfa] 공유 모듈에서 '${probe}' 를 찾지 못했습니다. remote 가 자체 사본을 쓸 수 있습니다.`,
    );
  }
  return mod;
}
