import '@testing-library/jest-dom/vitest';

import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 쿠키 배관. jsdom 이 필요해서 `.test.tsx` 다(JSX 는 없다).
 *
 * ⚠️ 모듈 스코프에 `warned: Set` 이 있다 — 경고는 **이름당 한 번**이라 리셋하지 않으면
 * 두 번째 테스트부터 경고가 안 나온다. 그래서 매번 `resetModules()` 로 새로 들인다.
 */
const load = () => import('./cookie-storage');

/** jsdom 의 document.cookie 를 비운다 (max-age=0 으로 덮어쓰는 게 유일한 방법) */
const clearCookies = () => {
  for (const part of document.cookie.split(/;\s*/)) {
    const name = part.split('=')[0];
    if (name) document.cookie = `${name}=; path=/; max-age=0`;
  }
};

let warn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.resetModules();
  clearCookies();
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('readCookie', () => {
  it('이름에 해당하는 값을 준다', async () => {
    document.cookie = 'a=1; path=/';
    const { readCookie } = await load();
    expect(readCookie('a')).toBe('1');
  });

  it('없으면 null 이다', async () => {
    const { readCookie } = await load();
    expect(readCookie('없는쿠키')).toBeNull();
  });

  it('접두사가 겹치는 다른 쿠키를 집지 않는다', async () => {
    document.cookie = 'cart-old=옛값; path=/';
    document.cookie = 'cart=진짜; path=/';
    const { readCookie } = await load();

    expect(readCookie('cart')).toBe('진짜');
  });

  it('퍼센트 디코딩까지 해서 준다', async () => {
    // 서버 쪽은 Next 의 cookies() 가 이미 벗겨서 준다. 여기서 안 벗기면
    // 도메인 파서가 서버·브라우저에서 다른 문자열을 보게 된다.
    document.cookie = `x=${encodeURIComponent('[{"id":"kb-001","q":2}]')}; path=/`;
    const { readCookie } = await load();

    expect(readCookie('x')).toBe('[{"id":"kb-001","q":2}]');
  });

  it('값 안의 = 를 보존한다', async () => {
    document.cookie = `x=${encodeURIComponent('a=b=c')}; path=/`;
    const { readCookie } = await load();
    expect(readCookie('x')).toBe('a=b=c');
  });

  it.each(['%', '%ZZ', '%E0%A4%A'])(
    '못 벗기는 값(%s)은 null 이다',
    async (raw) => {
      // 남이 심어놨거나 잘린 쿠키다. 던지면 화면이 죽는다.
      document.cookie = `x=${raw}; path=/`;
      const { readCookie } = await load();
      expect(readCookie('x')).toBeNull();
    },
  );
});

describe('createCookieStorage — 속성 조립', () => {
  const make = async (attributes = {}) => {
    const { createCookieStorage } = await load();
    return createCookieStorage<string>({
      attributes,
      read: (raw) => raw,
      write: (state) => state,
    });
  };

  it('기본 path 는 / 이고 sameSite 는 lax 다', async () => {
    // strict 는 재방문자가 외부 링크로 들어온 요청에 쿠키를 안 실어 첫 화면이 빈다 —
    // 이 저장소가 없애려던 증상이다.
    const storage = await make();
    storage.setItem('x', JSON.stringify({ state: '값' }));

    expect(document.cookie).toContain('x=');
  });

  it('http 에서는 secure 를 붙이지 않는다', async () => {
    // 붙이면 쿠키가 아예 저장되지 않아 dev 가 조용히 망가진다.
    expect(location.protocol).toBe('http:');
    const storage = await make();

    storage.setItem('x', JSON.stringify({ state: '값' }));

    expect(storage.getItem('x')).toBe(JSON.stringify({ state: '값' }));
  });

  it('maxAge 0 도 속성에 포함된다 — 삭제 경로가 여기에 의존한다', async () => {
    const storage = await make({ maxAge: 60 });
    storage.setItem('x', JSON.stringify({ state: '값' }));
    expect(storage.getItem('x')).not.toBeNull();

    storage.removeItem('x');

    expect(storage.getItem('x')).toBeNull();
  });
});

describe('createCookieStorage — 봉투', () => {
  const make = async () => {
    const { createCookieStorage } = await load();
    return createCookieStorage<{ n: number }>({
      read: (raw) => (raw === '못읽음' ? null : { n: Number(raw) }),
      write: (state) => String(state.n),
    });
  };

  it('read 결과를 { state } 로 감싸서 준다', async () => {
    const storage = await make();
    storage.setItem('x', JSON.stringify({ state: { n: 7 } }));

    expect(storage.getItem('x')).toBe(JSON.stringify({ state: { n: 7 } }));
  });

  it('봉투에 version 을 싣지 않는다', async () => {
    // 실으면 항상 현재 버전이 찍혀 비교가 영원히 일치하고, migrate 가 구조적으로
    // 발화할 수 없다. 배선된 척하는 값이라 아예 뺀다.
    const storage = await make();
    storage.setItem('x', JSON.stringify({ state: { n: 7 } }));

    expect(JSON.parse(storage.getItem('x') as string)).not.toHaveProperty(
      'version',
    );
  });

  it('쿠키가 없으면 null 이다', async () => {
    const storage = await make();
    expect(storage.getItem('없음')).toBeNull();
  });

  it('read 가 null 을 주면 저장된 값이 없는 것으로 본다', async () => {
    const storage = await make();
    document.cookie = 'x=못읽음; path=/';

    expect(storage.getItem('x')).toBeNull();
  });

  it('빈 문자열 쿠키는 null 이다', async () => {
    const storage = await make();
    document.cookie = 'x=; path=/';
    expect(storage.getItem('x')).toBeNull();
  });

  it('봉투를 못 읽으면 아무것도 적지 않는다', async () => {
    // 저장 실패보다 화면이 죽는 쪽이 나쁘다.
    const storage = await make();

    expect(() => storage.setItem('x', '깨진 JSON')).not.toThrow();
    expect(storage.getItem('x')).toBeNull();
  });

  it('write 결과에 퍼센트 인코딩을 씌운다 — readCookie 가 벗기는 것과 짝', async () => {
    const { createCookieStorage } = await load();
    const storage = createCookieStorage<string>({
      read: (raw) => raw,
      write: (state) => state,
    });

    storage.setItem('x', JSON.stringify({ state: '[{"id":"kb-001"}]' }));

    expect(document.cookie).toContain(encodeURIComponent('[{"id":"kb-001"}]'));
    expect(storage.getItem('x')).toBe(
      JSON.stringify({ state: '[{"id":"kb-001"}]' }),
    );
  });
});

describe('createCookieStorage — 조용한 실패를 알린다', () => {
  const make = async () => {
    const { createCookieStorage } = await load();
    return createCookieStorage<string>({
      read: (raw) => raw,
      write: (state) => state,
    });
  };

  it('4096바이트 예산을 넘으면 적지 않고 경고한다', async () => {
    // 넘으면 예외가 아니라 침묵이다 — 브라우저가 그냥 안 저장한다.
    const storage = await make();
    const huge = 'a'.repeat(5000);

    storage.setItem('x', JSON.stringify({ state: huge }));

    expect(storage.getItem('x')).toBeNull();
    expect(warn).toHaveBeenCalledOnce();
    expect(String(warn.mock.calls[0]![0])).toContain('4096');
  });

  it('예산 계산에 이름 길이를 포함한다', async () => {
    // `name.length + 1 + encoded.length` 다. 같은 값이라도 이름이 길면 넘어간다.
    const storage = await make();
    const value = JSON.stringify({ state: 'a'.repeat(4090) });

    storage.setItem('x', value); // 1 + 1 + 4090 = 4092
    expect(storage.getItem('x')).not.toBeNull();

    storage.setItem('n'.repeat(10), value); // 10 + 1 + 4090 = 4101
    expect(storage.getItem('n'.repeat(10))).toBeNull();
  });

  it('경고는 이름당 한 번뿐이다', async () => {
    // 쿠키가 차단된 브라우저에서는 상태가 바뀔 때마다 실패한다. 안 막으면 콘솔이 잠긴다.
    const storage = await make();
    const huge = 'a'.repeat(5000);

    storage.setItem('x', JSON.stringify({ state: huge }));
    storage.setItem('x', JSON.stringify({ state: huge }));
    storage.setItem('x', JSON.stringify({ state: huge }));

    expect(warn).toHaveBeenCalledOnce();
  });

  it('이름이 다르면 각각 한 번씩 알린다', async () => {
    const storage = await make();
    const huge = 'a'.repeat(5000);

    storage.setItem('x', JSON.stringify({ state: huge }));
    storage.setItem('y', JSON.stringify({ state: huge }));

    expect(warn).toHaveBeenCalledTimes(2);
  });

  it('되읽은 값이 다르면 경고한다', async () => {
    // document.cookie = ... 는 실패해도 던지지 않는다. 되읽기가 알아채는 유일한 방법이다.
    const storage = await make();
    const cookie = vi
      .spyOn(document, 'cookie', 'set')
      .mockImplementation(() => {});

    storage.setItem('x', JSON.stringify({ state: '값' }));

    expect(warn).toHaveBeenCalledOnce();
    expect(String(warn.mock.calls[0]![0])).toContain('되읽은 값이 다르다');
    cookie.mockRestore();
  });

  it('정상 쓰기에는 경고하지 않는다', async () => {
    const storage = await make();
    storage.setItem('x', JSON.stringify({ state: '값' }));
    expect(warn).not.toHaveBeenCalled();
  });

  it('쓰기에 실패해도 던지지 않는다', async () => {
    const storage = await make();
    const cookie = vi
      .spyOn(document, 'cookie', 'set')
      .mockImplementation(() => {});

    expect(() =>
      storage.setItem('x', JSON.stringify({ state: '값' })),
    ).not.toThrow();
    cookie.mockRestore();
  });
});
