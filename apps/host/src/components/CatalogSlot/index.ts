export * from './CatalogSlot';

/**
 * `CatalogSection` 은 이 폴더 안에 있지만 밖에서도 쓴다 — `/lab/*` 의 `LabPanel` 이
 * URL 정책 없이(= Slot 없이) 같은 섹션을 그린다. 그래서 **공개 API 에 올린다**
 * (배치 규칙 6절 "폴더 안의 조각에 외부 소비자가 생기면").
 *
 * 내부 경로(`@/components/CatalogSlot/components/CatalogSection`)로 직접 들어가지 않는다.
 * 대가는 이 배럴을 거치는 소비자의 청크에 `CatalogSlot`(`useSearchParams`)이 같이
 * 실리는 것이고, 실측 +509 B 다. 프리렌더는 깨지지 않는다 — 훅이 거기서 실행되지 않는다.
 */
export * from './components/CatalogSection';
