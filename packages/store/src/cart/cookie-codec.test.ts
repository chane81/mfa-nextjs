import { PRODUCTS, findProduct } from '@mfa/contracts';
import {
  CART_COOKIE_MAX_AGE,
  CART_COOKIE_NAME,
  MAX_CART_QUANTITY,
  type StoredCartLine,
  fromStoredLines,
  parseCartCookie,
  serializeCartCookie,
  toStoredLines,
} from './cookie-codec';
import { describe, expect, it } from 'vitest';

/**
 * ⚠️ 배럴(`./index`)이 아니라 **모듈을 직접** 부른다. 배럴을 타면 `create-store` ·
 * `use-cart-sync` 의 top-level 싱글턴이 같이 깨어나 순수 테스트가 오염된다.
 * 서버(RSC) 표면(`src/server.ts`)이 도메인 배럴을 안 타는 것과 같은 이유다.
 */

const A = PRODUCTS[0]!;
const B = PRODUCTS[1]!;

/** 타입 검사를 통과시키면서 사용자가 고친 쿠키를 흉내내기 위한 캐스팅 */
const stored = (value: unknown) => value as readonly StoredCartLine[];

describe('쿠키 상수', () => {
  it('이름에 RFC 6265 구분자를 쓰지 않는다', () => {
    // ':' 는 구분자라 파서마다 다르게 동작한다. 옛 localStorage 키는 'mfa-nextjs:cart' 였다.
    expect(CART_COOKIE_NAME).toBe('mfa-cart');
    expect(CART_COOKIE_NAME).not.toMatch(/[:;,\s=]/);
  });

  it('세션 쿠키가 아니다', () => {
    // 세션이면 브라우저를 닫을 때 사라져서 "새로고침해도 남는다"를 못 보여준다.
    expect(CART_COOKIE_MAX_AGE).toBe(60 * 60 * 24 * 30);
  });
});

describe('toStoredLines — 최소 표현만 담는다', () => {
  it('식별자와 수량만 남긴다', () => {
    const lines = fromStoredLines(stored([{ id: A.id, q: 2 }]));
    expect(toStoredLines(lines)).toEqual([{ id: A.id, q: 2 }]);
  });

  it('이름 · 가격 · 이모지는 담지 않는다', () => {
    // 쿠키는 요청마다 전송된다. 한글 상품명은 인코딩되면 글자당 9바이트다.
    const lines = fromStoredLines(stored([{ id: A.id, q: 1 }]));
    const [entry] = toStoredLines(lines);
    expect(Object.keys(entry!).sort()).toEqual(['id', 'q']);
  });
});

describe('fromStoredLines — 신뢰 경계', () => {
  it('카탈로그에서 상품 정보를 다시 읽는다', () => {
    const [line] = fromStoredLines(stored([{ id: A.id, q: 3 }]));
    expect(line).toEqual({
      productId: A.id,
      name: A.name,
      emoji: A.emoji,
      unitPrice: A.price,
      quantity: 3,
    });
  });

  it('모르는 상품 식별자는 그 줄만 버린다', () => {
    // 한 줄 때문에 장바구니 전체를 잃는 쪽이 나쁘다.
    const lines = fromStoredLines(
      stored([
        { id: '사라진-상품', q: 5 },
        { id: A.id, q: 1 },
      ]),
    );
    expect(lines.map((l) => l.productId)).toEqual([A.id]);
  });

  it('문자열 수량은 강제변환해서 받는다', () => {
    const [line] = fromStoredLines(stored([{ id: A.id, q: '3' }]));
    expect(line!.quantity).toBe(3);
  });

  it('소수 수량은 내림한다', () => {
    const [line] = fromStoredLines(stored([{ id: A.id, q: 2.9 }]));
    expect(line!.quantity).toBe(2);
  });

  it.each([
    ['0', 0],
    ['음수', -1],
    ['NaN', Number.NaN],
    ['숫자가 아닌 문자열', 'abc'],
    ['Infinity', Number.POSITIVE_INFINITY],
    ['-Infinity', Number.NEGATIVE_INFINITY],
    ['0.4 (내림하면 0)', 0.4],
  ])('수량이 %s 이면 줄을 버린다', (_label, q) => {
    expect(fromStoredLines(stored([{ id: A.id, q }]))).toEqual([]);
  });

  it('유한하지만 거대한 수량은 상한으로 자른다', () => {
    // q: 1e308 은 Number.isFinite 를 통과한다. 자르지 않으면 합계가 Infinity 가 되고
    // 화면에 '∞원' 이 찍힌다.
    const [line] = fromStoredLines(stored([{ id: A.id, q: 1e308 }]));
    expect(line!.quantity).toBe(MAX_CART_QUANTITY);
  });

  it.each([
    ['null 항목', null],
    ['undefined 항목', undefined],
    ['id 가 숫자', { id: 1, q: 1 }],
    ['id 가 없음', { q: 1 }],
    ['문자열 항목', 'kb-001'],
  ])('%s 은 건너뛴다', (_label, entry) => {
    expect(fromStoredLines(stored([entry]))).toEqual([]);
  });

  it('같은 상품이 두 줄로 오면 한 줄로 합친다', () => {
    // 스토어의 add 는 productId 로 병합해 "줄마다 상품이 유일하다"를 지킨다.
    // 복원 경로만 안 지키면 같은 React key 가 두 번 쓰이고 setQuantity 가 두 줄을 건드린다.
    const lines = fromStoredLines(
      stored([
        { id: A.id, q: 2 },
        { id: A.id, q: 3 },
      ]),
    );
    expect(lines).toHaveLength(1);
    expect(lines[0]!.quantity).toBe(5);
  });

  it('병합한 합계도 상한으로 자른다', () => {
    const lines = fromStoredLines(
      stored([
        { id: A.id, q: 60 },
        { id: A.id, q: 60 },
      ]),
    );
    expect(lines[0]!.quantity).toBe(MAX_CART_QUANTITY);
  });

  it('쿠키에 적힌 줄 순서를 보존한다', () => {
    // Map 의 삽입 순서 보존에 기대는 성질이다.
    const lines = fromStoredLines(
      stored([
        { id: B.id, q: 1 },
        { id: A.id, q: 1 },
      ]),
    );
    expect(lines.map((l) => l.productId)).toEqual([B.id, A.id]);
  });

  it('병합해도 처음 등장한 자리를 지킨다', () => {
    const lines = fromStoredLines(
      stored([
        { id: B.id, q: 1 },
        { id: A.id, q: 1 },
        { id: B.id, q: 1 },
      ]),
    );
    expect(lines.map((l) => l.productId)).toEqual([B.id, A.id]);
    expect(lines[0]!.quantity).toBe(2);
  });

  it('빈 배열은 빈 배열이다', () => {
    expect(fromStoredLines([])).toEqual([]);
  });
});

describe('parseCartCookie — 어떤 입력에도 던지지 않는다', () => {
  it.each([
    ['undefined', undefined],
    ['null', null],
    ['빈 문자열', ''],
  ])('%s 이면 빈 장바구니다', (_label, raw) => {
    expect(parseCartCookie(raw)).toEqual([]);
  });

  it.each([
    ['JSON 이 아닌 값', 'not json'],
    ['잘린 JSON', '[{"id":"kb-001"'],
    ['객체', '{"id":"kb-001","q":1}'],
    ['숫자', '42'],
    ['문자열 리터럴', '"kb-001"'],
    ['null 리터럴', 'null'],
  ])('%s 이면 빈 장바구니다', (_label, raw) => {
    expect(parseCartCookie(raw)).toEqual([]);
  });

  it('정상 쿠키를 장바구니로 되돌린다', () => {
    expect(parseCartCookie(`[{"id":"${A.id}","q":2}]`)).toEqual([
      {
        productId: A.id,
        name: A.name,
        emoji: A.emoji,
        unitPrice: A.price,
        quantity: 2,
      },
    ]);
  });

  it('퍼센트 디코딩을 하지 않는다', () => {
    // 여기서 decodeURIComponent 를 부르면 **서버만 두 번 벗긴다**. 값에 % 가 들어오는
    // 순간 서버는 URIError 로 빈 장바구니가 되고 브라우저는 멀쩡히 파싱해서,
    // 첫 HTML 과 하이드레이션이 갈라진다.
    const encoded = encodeURIComponent(`[{"id":"${A.id}","q":2}]`);
    expect(parseCartCookie(encoded)).toEqual([]);
  });

  it('% 가 섞인 깨진 값에도 던지지 않는다', () => {
    expect(() => parseCartCookie('%')).not.toThrow();
    expect(parseCartCookie('%ZZ')).toEqual([]);
  });
});

describe('serializeCartCookie', () => {
  it('퍼센트 인코딩을 하지 않는다 — 전송 규약은 저장 매체가 씌운다', () => {
    const lines = fromStoredLines(stored([{ id: A.id, q: 2 }]));
    const raw = serializeCartCookie(lines);
    expect(raw).toBe(`[{"id":"${A.id}","q":2}]`);
    expect(raw).not.toContain('%');
  });

  it('빈 장바구니는 빈 배열 JSON 이다', () => {
    expect(serializeCartCookie([])).toBe('[]');
  });
});

describe('라운드트립', () => {
  it('serialize → parse 가 값을 보존한다', () => {
    const lines = fromStoredLines(
      stored([
        { id: A.id, q: 2 },
        { id: B.id, q: 1 },
      ]),
    );
    expect(parseCartCookie(serializeCartCookie(lines))).toEqual(lines);
  });

  it('정규화는 멱등이다', () => {
    // 지저분한 입력을 한 번 정규화한 뒤에는 몇 번을 더 돌려도 같은 값이어야 한다.
    // 아니면 useCartSync 가 포커스마다 rehydrate 를 반복한다.
    const dirty = stored([
      { id: A.id, q: 2 },
      { id: '없는-상품', q: 9 },
      { id: A.id, q: 3 },
      { id: B.id, q: '4' },
    ]);
    const once = serializeCartCookie(fromStoredLines(dirty));
    const twice = serializeCartCookie(parseCartCookie(once));
    expect(twice).toBe(once);
  });

  it('상한을 넘긴 값도 한 번 정규화하면 고정된다', () => {
    const once = serializeCartCookie(
      fromStoredLines(stored([{ id: A.id, q: 1e308 }])),
    );
    expect(once).toBe(`[{"id":"${A.id}","q":${MAX_CART_QUANTITY}}]`);
    expect(serializeCartCookie(parseCartCookie(once))).toBe(once);
  });

  it('카탈로그가 값의 원본이다 — 저장된 사본이 낡지 않는다', () => {
    const [line] = parseCartCookie(`[{"id":"${A.id}","q":1}]`);
    expect(line!.unitPrice).toBe(findProduct(A.id)!.price);
  });
});
