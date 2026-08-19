import ProductDetail from './exposes/ProductDetail';
import ProductGrid from './exposes/ProductGrid';

/**
 * SSR 전용 진입점.
 *
 * 브라우저용 remoteEntry 와 별개로 node 타깃 CJS 번들을 하나 더 만든다.
 * host 서버가 이 파일을 HTTP 로 받아 React 를 주입하며 평가하고,
 * 실제 React 트리 안에서 remote 를 서버 렌더링한다.
 *
 * 키는 브라우저 쪽 `exposes` 키와 반드시 1:1 로 맞춰야 한다.
 * (host 의 loadRemoteModule 이 같은 문자열로 양쪽을 찾는다)
 */
const exposes = {
  './ProductGrid': ProductGrid,
  './ProductDetail': ProductDetail,
};

export default exposes;
