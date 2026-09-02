import { type CartLine, findProduct } from '@mfa/contracts';

/**
 * 장바구니를 쿠키에 싣고 내리는 규칙. **`@mfa/store` 가 소유한다.**
 *
 * ## 왜 계약 패키지가 아닌가
 *
 * 한때 `@mfa/contracts` 에 있었다. "서버와 브라우저가 같은 규칙을 봐야 한다"가 이유였는데,
 * 그건 **어느 공유 패키지에 두든 똑같이 성립한다** — 자리를 고르는 근거가 되지 못했다.
 *
 * contracts 가 담는 건 **host ↔ remote 의 props 계약**이다(ADR-013). 이 코덱이 넘는 경계는
 * 거기가 아니다 — **host(서버) ↔ `@mfa/store`(브라우저)** 고, `remote-cart` 는 이 함수들을
 * 하나도 부르지 않는다. 받는 건 `CartLine` 뿐이고 그건 props 로 온다.
 *
 * 지금 자리가 맞는 이유는 **가까움**이다. 쿠키에 무엇을 담을지(`cookie-codec`), 어떤 속성으로
 * 쓸지(`cookie-storage`), 어떻게 상태가 되는지(`create-store`), 합계는 어떻게 내는지
 * (`totals`)가 한 폴더에 있다. 저장 표현을 바꾸는 변경은 이 넷을 같이 건드리는데, 그중
 * 하나만 다른 패키지에 있으면 매번 두 곳을 오간다. 근거: ADR-015
 *
 * ## `CartLine` 은 왜 아직 contracts 에 있나
 *
 * 그건 host · remote · store 가 **같이 쓰는 어휘**다. `remote-cart` 의 세 모듈이
 * `initialLines` 로 그 타입을 받고 host 가 넘긴다. props 선언 자체는 remote 의 expose
 * 파일에 있지만(그래야 MF DTS 가 실어 나른다), 그 안에 쓰이는 `CartLine` 은 셋의
 * 공통 어휘라 계약 패키지에 남는다. 경계가 다르므로 자리도 다르다.
 */

/**
 * 저장에 쓰는 최소 표현 — 상품 식별자와 수량뿐이다.
 *
 * 이름 · 가격 · 이모지는 저장하지 않는다. 두 가지 이유다.
 *   ① 쿠키는 **요청마다 전송**된다. 한글 상품명은 URL 인코딩되면 글자당 9바이트라
 *      몇 줄만 담아도 헤더가 눈에 띄게 무거워진다.
 *   ② 가격이나 이름이 바뀌면 저장된 사본이 낡는다. 매번 카탈로그에서 읽으면 그 문제가 없다.
 */
export interface StoredCartLine {
  readonly id: string;
  readonly q: number;
}

/**
 * 쿠키 이름. 서버(host)와 브라우저(store)가 같은 값을 봐야 한다.
 *
 * ⚠️ `:` 를 쓰지 않는다. RFC 6265 에서 `:` 는 구분자라 쿠키 이름에 못 쓴다
 * (브라우저는 대개 봐주지만 파서마다 다르다). 옛 localStorage 키는
 * `mfa-nextjs:cart` 였고, 이름이 달라 옛 값이 딸려오지 않는다 — 저장 매체가
 * 바뀌었으니 그게 맞다.
 */
export const CART_COOKIE_NAME = 'mfa-cart';

/**
 * 쿠키 수명. 세션 쿠키로 두면 브라우저를 닫을 때 사라져 "새로고침해도 남는다"를 못 보여준다.
 */
export const CART_COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

/**
 * 한 줄이 가질 수 있는 최대 수량.
 *
 * **쿠키는 사용자가 고칠 수 있는 데이터다.** 이 파일은 모르는 상품 식별자를 이미 버리고
 * 있는데 수량만 무방비였다 — `q: 1e308` 이 `Number.isFinite` 를 통과해 합계 계산
 * (`unitPrice * quantity`)에서 `Infinity` 가 되고, 화면에 `∞원` 이 찍힌다.
 *
 * 값이 99인 건 상점의 규칙이지 안전 한계가 아니다. 중요한 건 **상한이 존재한다**는 것.
 */
export const MAX_CART_QUANTITY = 99;

/** 장바구니 줄 → 저장 표현 */
export function toStoredLines(
  lines: readonly CartLine[],
): readonly StoredCartLine[] {
  return lines.map((line) => ({ id: line.productId, q: line.quantity }));
}

/**
 * 저장 표현 → 장바구니 줄. 상품 정보는 카탈로그에서 다시 읽는다.
 *
 * 여기가 **신뢰 경계**다. 들어오는 값은 사용자가 고칠 수 있으므로 세 가지를 강제한다.
 *
 *   ① 모르는 상품 식별자는 **조용히 버린다.** 상품이 카탈로그에서 사라졌을 수도 있고,
 *      한 줄 때문에 장바구니 전체를 잃는 쪽이 나쁘다.
 *   ② 같은 상품이 두 줄로 오면 **한 줄로 합친다.** 스토어의 `add` 는 `productId` 로
 *      병합해 "줄마다 상품이 유일하다"를 지키는데, 복원 경로만 안 지키면 화면이
 *      같은 React key 를 두 번 쓰고 `setQuantity` · `remove` 가 두 줄을 동시에 건드린다.
 *   ③ 수량은 `MAX_CART_QUANTITY` 로 자른다. 근거는 그 상수 주석에 있다.
 */
export function fromStoredLines(
  stored: readonly StoredCartLine[],
): readonly CartLine[] {
  /**
   * 상품 식별자로 모은다. `Map` 은 **삽입 순서를 보존**하므로 쿠키에 적힌 줄 순서가
   * 그대로 남고, 인덱스를 들고 다니지 않아도 된다.
   */
  const byProduct = new Map<string, CartLine>();

  for (const entry of stored) {
    if (!entry || typeof entry.id !== 'string') continue;

    const quantity = Math.floor(Number(entry.q));
    if (!Number.isFinite(quantity) || quantity <= 0) continue;

    const product = findProduct(entry.id);
    if (!product) continue;

    const held = byProduct.get(product.id);

    byProduct.set(
      product.id,
      held
        ? {
            ...held,
            quantity: Math.min(held.quantity + quantity, MAX_CART_QUANTITY),
          }
        : {
            productId: product.id,
            name: product.name,
            emoji: product.emoji,
            unitPrice: product.price,
            quantity: Math.min(quantity, MAX_CART_QUANTITY),
          },
    );
  }

  return [...byProduct.values()];
}

/**
 * 쿠키 값 문자열 → 장바구니 줄. 어떤 입력이 와도 던지지 않는다.
 *
 * ## `raw` 는 **이미 퍼센트 디코딩된** 값이어야 한다
 *
 * 퍼센트 인코딩은 쿠키 **전송 규약**이지 장바구니의 표현이 아니다. 그래서 그 층은
 * 이 함수가 아니라 각 저장 매체가 벗긴다.
 *
 *   - 서버: Next 의 `cookies().get(name).value` 가 이미 디코딩해서 준다
 *     (`@edge-runtime/cookies` 의 `parseCookie` 가 `decodeURIComponent` 를 부른다).
 *   - 브라우저: `document.cookie` 는 원문을 주므로 `utils/cookie-storage` 의
 *     `readCookie` 가 벗긴 뒤 넘긴다.
 *
 * 예전엔 여기서 `decodeURIComponent` 를 불렀다. 그러면 **서버만 두 번 벗긴다** —
 * 값에 `%` 가 한 번이라도 들어오는 순간 서버는 `URIError` 로 빈 장바구니가 되고
 * 브라우저는 멀쩡히 파싱해서, 첫 HTML 과 하이드레이션이 갈라진다. 쿠키로 옮긴
 * 목적(깜빡임 제거)이 정확히 그 모양으로 무너진다.
 */
export function parseCartCookie(
  raw: string | undefined | null,
): readonly CartLine[] {
  if (!raw) return [];

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return fromStoredLines(parsed as readonly StoredCartLine[]);
  } catch {
    // 남이 심어놨거나 옛 포맷이 남은 경우다. 빈 장바구니로 시작한다
    return [];
  }
}

/**
 * 장바구니 줄 → 쿠키 값 문자열. **퍼센트 인코딩은 하지 않는다** —
 * 전송 규약은 저장 매체(`utils/cookie-storage`)가 씌운다. 근거는 `parseCartCookie`.
 */
export function serializeCartCookie(lines: readonly CartLine[]): string {
  return JSON.stringify(toStoredLines(lines));
}
