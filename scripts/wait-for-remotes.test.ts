import { describe, expect, it } from 'vitest';

import { type MfManifest, remoteEntryUrl } from './wait-for-remotes';

/**
 * 매니페스트가 스스로 공표한 remoteEntry 주소를 조립하는 순수 파서.
 *
 * catalog(Vite)와 cart(Rsbuild)가 서로 다른 번들러인데도 같은 필드를 채우므로,
 * 이 조립은 번들러를 몰라도 된다 — 그 성질이 깨지면 게이트가 한쪽 remote 만 헛돈다.
 */
const MANIFEST_URL = 'http://localhost:3001/mf-manifest.json';

const manifest = (metaData: MfManifest['metaData']): MfManifest => ({
  metaData,
});

describe('remoteEntryUrl', () => {
  it('절대 publicPath 를 기준으로 조립한다', () => {
    expect(
      remoteEntryUrl(
        manifest({
          publicPath: 'https://cdn.example.com/catalog/',
          remoteEntry: { name: 'remoteEntry.js' },
        }),
        MANIFEST_URL,
      ),
    ).toBe('https://cdn.example.com/catalog/remoteEntry.js');
  });

  it('publicPath 가 auto 면 매니페스트 URL 을 기준으로 푼다', () => {
    expect(
      remoteEntryUrl(
        manifest({
          publicPath: 'auto',
          remoteEntry: { name: 'remoteEntry.js' },
        }),
        MANIFEST_URL,
      ),
    ).toBe('http://localhost:3001/remoteEntry.js');
  });

  it('publicPath 가 없어도 매니페스트 URL 을 기준으로 푼다', () => {
    expect(
      remoteEntryUrl(
        manifest({ remoteEntry: { name: 'remoteEntry.js' } }),
        MANIFEST_URL,
      ),
    ).toBe('http://localhost:3001/remoteEntry.js');
  });

  it('버전 경로 아래의 매니페스트면 같은 디렉터리를 기준으로 푼다', () => {
    expect(
      remoteEntryUrl(
        manifest({ remoteEntry: { name: 'remoteEntry.js' } }),
        'https://catalog.example.com/vt1abc/mf-manifest.json',
      ),
    ).toBe('https://catalog.example.com/vt1abc/remoteEntry.js');
  });

  it('remoteEntry.path 를 디렉터리로 붙인다', () => {
    expect(
      remoteEntryUrl(
        manifest({
          remoteEntry: { name: 'remoteEntry.js', path: 'static/js' },
        }),
        MANIFEST_URL,
      ),
    ).toBe('http://localhost:3001/static/js/remoteEntry.js');
  });

  it.each(['/static/js', 'static/js/', '//static/js//'])(
    'path 의 앞뒤 슬래시(%s)를 정리한다',
    (path) => {
      expect(
        remoteEntryUrl(
          manifest({ remoteEntry: { name: 'remoteEntry.js', path } }),
          MANIFEST_URL,
        ),
      ).toBe('http://localhost:3001/static/js/remoteEntry.js');
    },
  );

  it('path 가 빈 문자열이면 붙이지 않는다', () => {
    expect(
      remoteEntryUrl(
        manifest({ remoteEntry: { name: 'remoteEntry.js', path: '' } }),
        MANIFEST_URL,
      ),
    ).toBe('http://localhost:3001/remoteEntry.js');
  });

  it.each([
    ['매니페스트가 null', null],
    ['metaData 없음', {}],
    ['remoteEntry 없음', manifest({})],
    ['name 없음', manifest({ remoteEntry: {} })],
  ])('%s 이면 null 이다 — ① 단계까지로 만족한다', (_label, value) => {
    expect(remoteEntryUrl(value as MfManifest | null, MANIFEST_URL)).toBeNull();
  });

  it('http publicPath 도 절대값으로 인정한다', () => {
    expect(
      remoteEntryUrl(
        manifest({
          publicPath: 'http://cart.example.com/',
          remoteEntry: { name: 'remoteEntry.js' },
        }),
        MANIFEST_URL,
      ),
    ).toBe('http://cart.example.com/remoteEntry.js');
  });
});
