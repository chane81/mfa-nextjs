/**
 * 이 폴더의 진입점은 **둘이다.** 여기는 URL 정책을 아는 쪽(`CatalogSlot`)만 내보낸다.
 * URL 없이 섹션만 쓰는 소비자는 `./components` 로 간다 — 섞어서 한 배럴에 담으면
 * 그쪽 청크에 `useSearchParams` 가 따라 들어간다(배치 규칙 6절, 실측 +509 B).
 */
export * from './CatalogSlot';
