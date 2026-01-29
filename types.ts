
export interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  category: string;
  image: string;
  savings?: string;
  isAvailable: boolean;
}

export interface Category {
  id: string;
  name: string;
}

export interface CartItem extends Product {
  quantity: number;
  observation?: string;
}

export interface StoreInfo {
  name: string;
  slogan: string;
  hours: string;
  whatsapp: string;
}

export type TableStatus = 'free' | 'occupied';
export type OrderStatus = 'pending' | 'preparing' | 'ready' | 'delivered';
export type OrderType = 'table' | 'takeaway' | 'delivery' | 'counter';

export interface Order {
  id: string;
  customerName: string;
  customerPhone?: string;
  items: CartItem[];
  total: number;
  discount?: number;
  finalTotal: number;
  paymentMethod: string;
  timestamp: Date | string;
  tableId: number;
  status: OrderStatus;
  orderType: OrderType;
  address?: string;
  couponCode?: string;
  isUpdated?: boolean;
  observation?: string;
}

export interface Table {
  id: number;
  status: TableStatus;
  currentOrder: Order | null;
}

export interface Coupon {
  id: string;
  code: string;
  percentage: number;
  isActive: boolean;
  scopeType: 'all' | 'category' | 'product';
  scopeValue: string;
}

export interface LoyaltyConfig {
  isActive: boolean;
  spendingGoal: number;
  scopeType: 'all' | 'category' | 'product';
  scopeValue: string;
}

export interface LoyaltyUser {
  phone: string;
  name: string;
  accumulated: number;
}

export interface StoreConfig {
  tablesEnabled: boolean;
  deliveryEnabled: boolean;
  counterEnabled: boolean;
  statusPanelEnabled: boolean;
}
