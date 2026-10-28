import { type StateStorage } from 'zustand/middleware';

/**
 * zustand `persist` 를 **쿠키** 위에서 돌리는 범용 장치.
 *
 * ## 왜 쿠키 저장소가 따로 필요한가
 *
 * `localStorage` 는 브라우저에만 있다. 서버는 그 값을 모른 채 HTML 을 만들고, 첫 화면이
 * 항상 빈 상태였다가 하이드레이션 커밋에서 실제 값으로 한 프레임에 바뀐다 — 깜빡임이다.
 * 쿠키는 요청에 실려 가므로 서버가 읽을 수 있고, 그래서 첫 HTML 부터 값이 맞는다.
 * 이 판단의 전말은 ADR-014.
 *
 * ## 무엇을 맡고 무엇을 안 맡나
 *
 * 여기가 맡는 건 **쿠키 배관**뿐이다 — `document.cookie` 읽기·쓰기·삭제, 속성 조립,
 * 그리고 persist 가 기대하는 `{ state, version }` 봉투.
 *
 * **값의 표현은 도메인이 정한다.** `read` · `write` 로 받는다. 쿠키는 요청마다 전송되므로
 * 대개 최소 표현을 쓰게 되는데(장바구니는 `[{id, q}]`), 그 규칙은 서버도 같이 봐야 하는
 * 값이라 이 패키지가 아니라 계약(`@mfa/contracts`)에 있어야 한다. 여기서 인코딩을
 * 정해버리면 서버와 브라우저의 규칙이 두 곳으로 갈라진다.
 *
 * ## 반드시 동기여야 한다
 *
 * persist 는 동기 저장소면 **스토어 생성 시점에 복원을 끝낸다**(zustand 5.0.15 문서).
 * 비동기 저장소를 주면 복원이 마이크로태스크로 밀려 첫 렌더가 빈 상태가 된다 —
 * 없애려던 증상이 그대로 돌아온다. 그래서 플랫폼 표준 `cookieStore` API 는 쓸 수 없다.
 * 비동기다.
 *
 * ## 왜 라이브러리가 아닌가 (조사함, 2026-08-20)
 *
 * zustand 문서가 제시하는 표준이 **어댑터를 직접 구현하는 것**이다 — IndexedDB
 * (`idb-keyval`) 예제도 URL 쿼리 예제도 전부 `StateStorage` 를 손으로 쓴다.
 *
 * zustand 전용 패키지는 `zustand-cookie-storage` 하나뿐인데 기능상 못 쓴다. 상태를
 * **잎 노드마다 쿠키 하나씩** 쪼개고 중첩 경로를 쿠키 *이름*에 `|` 로 인코딩한다.
 * 서버가 읽으려면 그 복원 로직을 재구현해야 하는데, 서버가 읽는 게 목적의 전부다.
 * `sameSite` 옵션도 없다.
 *
 * 범용 라이브러리(`js-cookie` · `cookie-es` · `cookie`)가 대체하는 건 아래 `readCookie`
 * 와 속성 조립, 합쳐 열 줄 남짓이다. 그 대가로 이 패키지에 외부 의존성이 생기는데,
 * `@mfa/store` 는 host · catalog · cart 가 각자 번들하고 remote 는 웹 · SSR 양쪽에
 * 실으므로 하나가 다섯 군데로 복제된다.
 */

/**
 * 쿠키 하나(`name=value`)에 허용되는 바이트 예산.
 *
 * 스펙(RFC 6265)이 요구하는 최소 보장은 쿠키당 4096바이트고 브라우저들도 대체로 그 근처다.
 * **넘으면 예외가 아니라 침묵이다** — 브라우저가 그냥 안 저장한다. 아래에서 미리 재는 이유가
 * 그것이다. 속성 문자열은 세지 않는다. 브라우저마다 포함 여부가 갈리고, 여기서 조립하는
 * 속성은 백 바이트를 넘지 않아 4096 안에서 흡수된다.
 */
const MAX_COOKIE_BYTES = 4096;

/** 이미 경고한 쿠키 이름. 아래에서 왜 한 번만 알리는지 설명한다 */
const warned = new Set<string>();

/**
 * 쿠키 쓰기 실패를 알린다. **이름당 한 번만, 던지지는 않는다.**
 *
 * `document.cookie = ...` 는 실패해도 던지지 않는다. 크기 초과 · 브라우저의 쿠키 차단 ·
 * 정책 거부가 전부 무음이라, 화면의 스토어만 바뀌고 쿠키는 옛 값에 머문다. 그 상태로
 * 새로고침하면 **서버가 옛 장바구니를 렌더한다** — 이 저장소가 없애려던 불일치가
 * 정확히 그 모양으로 돌아온다. 알아채는 유일한 방법이 되읽기다.
 *
 * 던지지 않는 이유: 저장 실패 때문에 화면이 죽는 쪽이 더 나쁘다.
 *
 * `NODE_ENV` 로 가르지 않는다. 이 패키지는 브라우저 전용이라 node 타입이 없고, 경고
 * 하나 때문에 `@types/node` 를 들이는 건 값이 안 맞는다. 대신 **이름당 한 번**으로 막는다 —
 * 쿠키가 차단된 브라우저에서는 상태가 바뀔 때마다 실패하므로, 안 막으면 콘솔이 잠긴다.
 * 한 번이면 원인을 아는 데 충분하고, 그 한 번은 prod 에서도 볼 값어치가 있다.
 */
function warnCookieWriteFailed(name: string, reason: string): void {
  if (warned.has(name)) return;
  warned.add(name);
  console.warn(`[cookie-storage] "${name}" 쓰기 실패 — ${reason}`);
}

/** 쿠키 속성. 이름은 `document.cookie` 표기가 아니라 읽기 쉬운 쪽으로 맞췄다 */
export interface CookieAttributes {
  /** 기본 `/`. 라우트마다 다른 쿠키를 만들 이유는 거의 없다 */
  path?: string;
  /** 초 단위. 안 주면 세션 쿠키가 되어 브라우저를 닫을 때 사라진다 */
  maxAge?: number;
  /**
   * 기본 `lax`. 값을 안 적어도 브라우저 기본이지만 **의도를 남기려고** 적는다.
   * `strict` 는 재방문자가 외부 링크로 들어온 요청에 쿠키를 안 실어 첫 화면이 빈 상태가
   * 된다 — 이 저장소가 없애려던 증상이다.
   */
  sameSite?: 'lax' | 'strict' | 'none';
  /**
   * 기본값은 **현재 스킴을 따른다**(https 면 켠다). http 인 dev 에서 켜면 쿠키가 아예
   * 저장되지 않아 조용히 망가진다. `sameSite: 'none'` 은 이 값이 참이어야 한다.
   */
  secure?: boolean;
  domain?: string;
}

export interface CookieStorageOptions<S> {
  attributes?: CookieAttributes;
  /** 쿠키 값 문자열 → 상태. 읽을 수 없으면 `null`(= 저장된 값 없음으로 취급) */
  read(rawValue: string): S | null;
  /** 상태 → 쿠키 값 문자열 */
  write(state: S): string;
}

/**
 * persist 가 저장소와 주고받는 봉투. `partialize` 결과가 `state` 에 담긴다.
 *
 * **`version` 을 싣지 않는다.** persist 는 봉투의 `version` 이 숫자일 때만 비교하고,
 * 아니면 그대로 상태를 쓴다(zustand 5.0.15 소스). 그런데 쿠키에는 버전이 없으므로
 * 여기서 값을 넣으면 **항상 현재 버전**이 찍힌다 — 비교가 영원히 일치해
 * `migrate` 가 구조적으로 발화할 수 없다. 배선된 척하는 값이라 아예 뺀다.
 *
 * 저장 표현이 바뀌면 그건 도메인의 `read` 가 다룬다. 원문 문자열을 보는 유일한 자리라
 * 옛 모양을 알아보고 변환하는 것도 거기서만 가능하다.
 */
interface Envelope<S> {
  state: S;
}

/**
 * `document.cookie` 한 줄에서 이름 하나를 뽑아 **퍼센트 디코딩까지 해서** 준다.
 *
 * 구분자를 `'; '` 로 못 박지 않는다 — 브라우저는 대개 공백을 넣어 주지만 스펙이
 * 보장하지 않는다. 값에는 인코딩되지 않은 `;` 가 들어갈 수 없으므로 이 분해는 안전하다.
 *
 * **디코딩이 여기 있는 이유.** 퍼센트 인코딩은 쿠키 전송 규약이지 값의 표현이 아니다.
 * 서버 쪽은 Next 의 `cookies()` 가 이미 벗겨서 주므로(`@edge-runtime/cookies`),
 * 이 층을 도메인 파서(`read`)에 넘기면 **서버만 두 번 벗기는** 비대칭이 생긴다.
 * 양쪽 다 "디코딩된 문자열"을 보게 맞춘다.
 *
 * 못 벗기는 값(`%` 하나만 있는 등)은 남이 심어놨거나 잘린 쿠키다. `null` 로 돌린다.
 */
export function readCookie(name: string): string | null {
  const prefix = `${name}=`;
  for (const part of document.cookie.split(/;\s*/)) {
    if (!part.startsWith(prefix)) continue;
    try {
      return decodeURIComponent(part.slice(prefix.length));
    } catch {
      return null;
    }
  }
  return null;
}

function serializeAttributes(attributes: CookieAttributes): string {
  const secure =
    attributes.secure ??
    (typeof location !== 'undefined' && location.protocol === 'https:');

  const parts = [
    `path=${attributes.path ?? '/'}`,
    `samesite=${attributes.sameSite ?? 'lax'}`,
  ];
  if (attributes.maxAge !== undefined)
    parts.push(`max-age=${attributes.maxAge}`);
  if (attributes.domain) parts.push(`domain=${attributes.domain}`);
  if (secure) parts.push('secure');

  return parts.join('; ');
}

/**
 * 쿠키를 저장소로 쓰는 `StateStorage` 를 만든다.
 *
 *   storage: createJSONStorage(() => {
 *     if (typeof document === 'undefined') throw new Error('서버에는 document 가 없다');
 *     return createCookieStorage({ read, write, attributes });
 *   })
 *
 * 서버에서 getter 가 던지면 `createJSONStorage` 가 `undefined` 를 돌려주고 persist 는
 * 복원 · 저장을 통째로 건너뛴다(zustand 5 규약). 서버가 아는 값은 스토어가 아니라
 * props 로 내려가야 한다 — 그래야 하이드레이션 렌더와 서버 HTML 이 같아진다.
 */
export function createCookieStorage<S>({
  attributes = {},
  read,
  write,
}: CookieStorageOptions<S>): StateStorage {
  return {
    getItem(name) {
      if (typeof document === 'undefined') return null;

      const raw = readCookie(name);
      if (!raw) return null;

      const state = read(raw);
      if (state === null) return null;

      const envelope: Envelope<S> = { state };
      return JSON.stringify(envelope);
    },

    setItem(name, value) {
      if (typeof document === 'undefined') return;

      // 봉투를 못 읽으면 적지 않는다. 저장 실패보다 화면이 죽는 쪽이 나쁘다
      let state: S;
      try {
        state = (JSON.parse(value) as Envelope<S>).state;
      } catch {
        return;
      }

      // 퍼센트 인코딩은 전송 규약이라 여기서 씌운다(`readCookie` 가 벗기는 것과 짝)
      const plain = write(state);
      const encoded = encodeURIComponent(plain);

      if (name.length + 1 + encoded.length > MAX_COOKIE_BYTES) {
        warnCookieWriteFailed(
          name,
          `값이 ${MAX_COOKIE_BYTES}바이트 예산을 넘었다(${encoded.length}). 브라우저가 통째로 버린다`,
        );
        return;
      }

      document.cookie = `${name}=${encoded}; ${serializeAttributes(attributes)}`;

      // 쓰기 실패는 예외로 오지 않는다. 되읽어야만 알 수 있다 (아래 주석)
      if (readCookie(name) !== plain) {
        warnCookieWriteFailed(
          name,
          '되읽은 값이 다르다. 브라우저가 쿠키를 막았거나 같은 이름의 다른 쿠키가 가리고 있다',
        );
      }
    },

    removeItem(name) {
      if (typeof document === 'undefined') return;

      // 지우기는 "이미 만료된 쿠키를 덮어쓰기"다. 속성이 같아야 같은 쿠키로 인식된다
      document.cookie = `${name}=; ${serializeAttributes({ ...attributes, maxAge: 0 })}`;
    },
  };
}
