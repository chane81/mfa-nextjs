import { LabIntro } from './_src/components/LabIntro';
import { LabModeList } from './_src/components/LabModeList';

/**
 * 캐시 실험 인덱스 — 셸만 둔다(배치 규칙 7절). 설명과 카드 목록은 `_src/components/` 에 있다.
 *
 * 세 실험 페이지는 **완전히 같은 트리**를 렌더한다(같은 remote, 같은 패널).
 * 다른 건 캐시 선언뿐이라 동작 차이만 분리해서 관측된다.
 */
export default function LabIndexPage() {
  return (
    <>
      <LabIntro />
      <LabModeList />
    </>
  );
}
