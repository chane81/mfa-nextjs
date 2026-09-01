---
paths:
  - 'apps/remote-catalog/**'
  - 'apps/remote-cart/**'
  - 'scripts/**'
---

# remote 앱(catalog · cart) 규칙

두 remote 는 **일부러 다른 번들러**다(catalog = Vite 8 + `@module-federation/vite`,
cart = Rsbuild 2 + `@module-federation/rsbuild-plugin`). 번들러 자유도가 이 저장소의 주장 중 하나라
한쪽으로 통일하지 않는다. 대신 **산출물 계약을 같게 맞춘다.**

## 산출물 계약

| 파일                                  | 무엇                                    |
| ------------------------------------- | --------------------------------------- |
| `remoteEntry.js` · `mf-manifest.json` | 브라우저 MF 런타임용                    |
| `mf-server.cjs`                       | host **서버**가 받아 실행하는 노드 번들 |
| `style.css`                           | 이 remote 의 CSS 전부 (해시 없음, 루트) |
| `mf-version.json`                     | 버전 공표. 배포 경로는 `/v<version>/`   |

이름과 위치는 `MF_FILES` 가 정한다. 번들러 설정에서 출력 경로 · 파일명을 바꾸려면 **계약 쪽을
먼저** 본다. CSS 는 해시를 붙이지 않는다 — 주소를 host 가 계산으로 알아내야 하고, 캐시 무효화는
`/v<version>/` 불변 경로가 맡는다.

## dev 와 배포의 주소가 같아야 한다

host 는 dev 든 배포든 같은 모양의 URL 을 만든다. 그래서 dev 서버가 부족한 응답을 메꾼다.

- catalog: `/style.css` 를 `?direct` 로 변환해 `text/css` 로 응답(`serveDevStylesheet`).
  안 하면 Vite 가 CSS 를 JS 모듈로 주고 브라우저가 **에러 없이** 무시한다.
- catalog: `/mf-server.cjs` 는 디스크에서 읽어 내려주고, `mf-version.json` 은 **일부러 404** 다.
  dev 에서 버전을 공표하면 하지도 않은 배포를 알리게 되고 무결성 검사에서 죽는다.

dev 전용 미들웨어를 늘릴 때는 `configureServer`(dev)와 `configurePreviewServer`(preview) 훅
자체를 판별자로 쓴다. `NODE_ENV` · `command` 로는 구분이 안 된다.

## `exposes` 는 손으로 적지 않는다

`src/exposes/` 를 읽어서 만든다 — `readExposes('./src/exposes', { ignore: [/\.test\.tsx$/] })`
(`@mfa/remote-config/node`). 번들러가 둘이라 스캔을 각자 구현하면 "무엇이 expose 인가"가
remote 마다 갈린다. dev 가 볼 게 아닌 이웃 파일이 생기면 `ignore` 에 줄을 하나 더 넣는다.

**대가는 파일 하나로 공개 계약이 바뀐다는 것이다.** 그래서 각 remote 의
`src/exposes/contract.test.ts` 가 스캔 결과를 `@mfa/contracts` 의 `MODULE_IDS` 와 대조한다.
파일을 추가했으면 `@mfa/contracts` 의 `MODULES` 에 한 줄 등록해야 그 테스트가 통과한다.
거기 한 곳이 타입 맵(`RemoteModuleMap`)과 런타임 목록(`MODULE_IDS`)을 **둘 다** 만든다.

## DTS 는 껐다

MF 자동 타입 생성을 켜면 타입 SSOT 가 `@mfa/contracts` 와 중복되고, `pnpm typecheck` 가 remote 기동을
요구하게 된다. 지금은 네트워크 없이 돈다 — 이 성질을 잃지 않는다.

## dev 기동 순서

`scripts/wait-for-remotes.ts` 가 host 앞에 게이트를 건다. 단 **HTTP 200 만** 보므로 모듈 레벨
초기화 실패는 못 막는다. 60초 뒤에는 경고만 찍고 통과한다 — 로그에 `준비됨` 네 줄을 확인한다.
