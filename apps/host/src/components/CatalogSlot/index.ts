/**
 * 이 폴더의 진입점은 **대표 컴포넌트 하나뿐이다.** `components/` 안의 조각을 밖에서 쓸
 * 때는 그 파일 경로로 가리킨다 — 조각까지 여기 모으면 Slot 의 `useSearchParams` 가
 * 그 소비자 청크로 따라간다(배치 규칙 6절).
 */
export * from './CatalogSlot';
