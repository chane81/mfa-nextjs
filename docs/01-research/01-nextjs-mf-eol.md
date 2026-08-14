# `@module-federation/nextjs-mf` 는 왜 못 쓰나

조사일: 2026-08-14

## 사실 확인 (npm registry 직접 조회)

```
$ npm view @module-federation/nextjs-mf peerDependencies time.modified
{
  "peerDependencies": {
    "webpack": "^5.40.0",
    "next": "^12 || ^13 || ^14 || ^15",
    "react": "^17 || ^18 || ^19",
    "react-dom": "^17 || ^18 || ^19",
    "styled-jsx": "*"
  },
  "time.modified": "2026-08-06T11:25:08.221Z"
}
```

- 최신 버전: **8.8.73**
- peer 의 `next` 범위가 **`^15` 에서 끊긴다** → Next.js 16 은 지원 대상이 아니다.

## 세 겹의 벽

### 1. peer 범위 (표면적 문제)

`--force` 나 pnpm overrides 로 뚫을 수는 있다. 하지만 아래 두 개가 진짜 벽이다.

### 2. 번들러 (구조적 문제)

`nextjs-mf` 는 webpack 플러그인이다. Next.js 16 부터 **Turbopack 이 dev/build 기본값**이다.
`next dev --webpack` / `next build --webpack` 플래그로 webpack 으로 되돌릴 수는 있지만,
이건 프레임워크가 명시적으로 legacy 취급하는 경로다. 신규 프로젝트를 여기에 태우면
다음 메이저에서 그대로 벽에 부딪힌다.

### 3. App Router (근본적 문제)

`nextjs-mf` 는 **App Router 를 지원한 적이 없다.** Pages Router 에만 붙었고, 그마저도
back-port 성 수정만 들어갔다.

이유는 단순하다. React Server Components 는 "브라우저가 받아 실행할 JS 청크"가 아니라
서버가 만든 RSC payload 로 흐른다. Module Federation 이 전제하는
"런타임에 원격 청크를 받아 실행" 모델과 레이어가 다르다.
서버 컴포넌트를 federate 할 방법이 원리적으로 없다.

## 업스트림 입장

- module-federation/core 이슈 #3153: **"Next.js Support is in maintenance mode"**
  - 현 상태 유지는 2026 중후반까지, 이후 CI 에서 nextjs-mf 단위 테스트 제거 예정
  - Next.js 16 이 Pages Router 를 쉽게 못 고칠 정도로 깨뜨리면 16 은 지원하지 않는다고 명시
- 메인테이너 권고: "마이크로 프론트엔드를 하려면 Next.js 를 쓰지 마라"

## 결론

**빌드타임 Module Federation 플러그인으로 Next.js 16 을 붙이는 길은 닫혔다.**
우회하려 하지 말고 다른 축으로 갈아타야 한다 → [02-alternatives.md](./02-alternatives.md)

## 출처

- [module-federation/core#3153 — Next.js Support is in maintenance mode](https://github.com/module-federation/core/issues/3153)
- [@module-federation/nextjs-mf — npm](https://www.npmjs.com/package/@module-federation/nextjs-mf)
- [Module Federation — Next.js 통합 문서](https://module-federation.io/practice/frameworks/next/)
- [vercel/next.js Discussion #77862 — Module Federation with Next.js](https://github.com/vercel/next.js/discussions/77862)
- [vercel/next.js Discussion #69836 — Module Federation within Turbopack](https://github.com/vercel/next.js/discussions/69836)
- [Next.js 16 릴리스 노트](https://nextjs.org/blog/next-16)
