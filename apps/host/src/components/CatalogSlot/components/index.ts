/**
 * Slot 과 나란한 **두 번째 진입점.** `CatalogSection` 은 이 폴더 안에 살지만
 * `/lab/*` 의 `LabPanel` 도 쓰므로 밖으로 공개한다(배치 규칙 6절).
 *
 * 여기에 URL 을 아는 모듈을 올리지 않는다 — 그러면 가른 의미가 없어진다.
 */
export * from './CatalogSection';
