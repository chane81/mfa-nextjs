import { Writable } from 'node:stream';

/**
 * node `http` 응답의 가짜 구현. 서버를 띄우지 않고 핸들러만 태우기 위한 것이다.
 *
 * **`Writable` 을 상속한다.** 정적 서버(`scripts/serve-remote-dist.ts`)는 본문을
 * `createReadStream(file).pipe(res)` 로 흘려보내므로, 평범한 객체를 주면 pipe 가 붙지 못한다.
 * 반대로 미들웨어(`createMfDevMiddleware`)는 `end(문자열)` 로 한 번에 끝내고 테스트가
 * 그 자리에서 단언한다 — 그래서 `end` 는 **동기로도** 값을 남긴다.
 *
 * 스트림 경로를 태우는 테스트는 `await res.done` 으로 끝을 기다린다. 안 기다리면
 * 파일 읽기가 테스트 종료 뒤에 이어져, 임시 디렉터리를 지우는 순간 ENOENT 가
 * **처리되지 않은 예외**로 튄다(실측).
 */
export interface FakeResponse extends Writable {
  statusCode: number;
  headers: Record<string, string>;
  /** `end(문자열)` 로 온 본문. 스트림 경로는 `text` 를 본다 */
  body: string | undefined;
  /** 스트림으로 흘러온 본문 전체 */
  text: string;
  ended: boolean;
  setHeader(name: string, value: string): void;
  /** 응답이 끝날 때까지 */
  done: Promise<void>;
}

export function fakeResponse(): FakeResponse {
  const chunks: Buffer[] = [];

  const res = new Writable({
    write(chunk: Buffer | string, _encoding, callback) {
      chunks.push(Buffer.from(chunk));
      callback();
    },
  }) as FakeResponse;

  res.statusCode = 200;
  res.headers = {};
  res.body = undefined;
  res.text = '';
  res.ended = false;

  res.setHeader = (name, value) => {
    res.headers[name.toLowerCase()] = value;
  };

  const end = res.end.bind(res) as (chunk?: unknown) => FakeResponse;
  res.end = ((chunk?: unknown) => {
    if (typeof chunk === 'string') res.body = chunk;
    res.ended = true;
    return end(chunk);
  }) as FakeResponse['end'];

  res.done = new Promise<void>((resolve) => {
    res.on('finish', () => {
      res.text = Buffer.concat(chunks).toString('utf8');
      res.ended = true;
      resolve();
    });
  });

  return res;
}
