
import { Product, StoreInfo, Table } from './types';

export const STORE_INFO: StoreInfo = {
  name: 'JG Conveniência',
  slogan: 'Praticidade e Qualidade ⛽',
  hours: 'Funcionamento 24h | Todos os dias',
  whatsapp: '558591076984'
};

// Mesas 1 a 12 (Físicas)
// 900-949 (Entregas Dinâmicas)
// 950-999 (Balcão Dinâmico)
export const INITIAL_TABLES: Table[] = [
  ...Array.from({ length: 12 }, (_, i) => ({
    id: i + 1,
    status: 'free' as const,
    currentOrder: null
  })),
  ...Array.from({ length: 10 }, (_, i) => ({
    id: 900 + i,
    status: 'free' as const,
    currentOrder: null
  })),
  ...Array.from({ length: 10 }, (_, i) => ({
    id: 950 + i,
    status: 'free' as const,
    currentOrder: null
  }))
];

export const MENU_ITEMS: Product[] = [
  {
    id: 'cb1',
    name: 'Combo Café Completo',
    description: '1 Café Expresso + 1 Pão de Queijo + 1 Suco de Laranja.',
    price: 16.90,
    category: 'Combos',
    image: 'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=400&h=300&fit=crop',
    savings: 'Economize R$ 3,10',
    isAvailable: true
  },
  {
    id: 'c1',
    name: 'Café Expresso',
    description: 'Aquele café forte para despertar.',
    price: 5.50,
    category: 'Cafeteria',
    image: 'https://images.unsplash.com/photo-1510972527921-ce03766a1cf1?w=400&h=300&fit=crop',
    isAvailable: true
  }
];
