/** 이커머스 도메인 타입 — host / remote 가 공유하는 계약(contract) */

export interface Product {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  /** 최소 화폐 단위(원) */
  readonly price: number;
  readonly currency: 'KRW';
  readonly category: ProductCategory;
  readonly rating: number;
  readonly stock: number;
  /** 이미지 대신 사용하는 이모지 (외부 의존 없는 데모용) */
  readonly emoji: string;
}

export type ProductCategory = 'keyboard' | 'audio' | 'display' | 'accessory';

export const PRODUCT_CATEGORIES: readonly ProductCategory[] = [
  'keyboard',
  'audio',
  'display',
  'accessory',
];

export const PRODUCTS: readonly Product[] = [
  {
    id: 'kb-001',
    name: 'Aurora 75 기계식 키보드',
    description:
      '가스켓 마운트, 핫스왑 지원. 무접점 느낌의 리니어 스위치 기본 장착.',
    price: 189000,
    currency: 'KRW',
    category: 'keyboard',
    rating: 4.7,
    stock: 24,
    emoji: '⌨️',
  },
  {
    id: 'kb-002',
    name: 'Nimbus TKL 무선 키보드',
    description: '2.4GHz / 블루투스 3채널. 배터리 4000mAh.',
    price: 129000,
    currency: 'KRW',
    category: 'keyboard',
    rating: 4.4,
    stock: 8,
    emoji: '🎹',
  },
  {
    id: 'au-001',
    name: 'Echo Pro ANC 헤드폰',
    description: '적응형 노이즈 캔슬링, LDAC 코덱 지원.',
    price: 249000,
    currency: 'KRW',
    category: 'audio',
    rating: 4.8,
    stock: 15,
    emoji: '🎧',
  },
  {
    id: 'au-002',
    name: 'Pebble 무선 이어버드',
    description: '케이스 포함 32시간 재생. IPX5 방수.',
    price: 89000,
    currency: 'KRW',
    category: 'audio',
    rating: 4.1,
    stock: 51,
    emoji: '🫧',
  },
  {
    id: 'dp-001',
    name: 'Vista 27 4K 모니터',
    description: '27인치 IPS, 144Hz, USB-C 90W 급전.',
    price: 599000,
    currency: 'KRW',
    category: 'display',
    rating: 4.6,
    stock: 5,
    emoji: '🖥️',
  },
  {
    id: 'dp-002',
    name: 'Vista 34 울트라와이드',
    description: '34인치 21:9, 곡률 1800R.',
    price: 899000,
    currency: 'KRW',
    category: 'display',
    rating: 4.5,
    stock: 0,
    emoji: '📺',
  },
  {
    id: 'ac-001',
    name: 'Loop USB-C 도킹 허브',
    description: 'HDMI 2.1 / 이더넷 / SD / PD 100W 패스스루.',
    price: 79000,
    currency: 'KRW',
    category: 'accessory',
    rating: 4.2,
    stock: 63,
    emoji: '🔌',
  },
  {
    id: 'ac-002',
    name: 'Grid 데스크 매트',
    description: '900×400mm 발수 코팅 표면.',
    price: 32000,
    currency: 'KRW',
    category: 'accessory',
    rating: 4.0,
    stock: 120,
    emoji: '🟫',
  },
];

export function findProduct(id: string): Product | undefined {
  return PRODUCTS.find((product) => product.id === id);
}

export function formatKRW(amount: number): string {
  return `${amount.toLocaleString('ko-KR')}원`;
}
