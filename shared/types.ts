export interface Product {
  id: string;
  name: string;
  priceCents: number;
}

export interface CartItem {
  productId: string;
  qty: number;
}

export interface OrderLine {
  productId: string;
  name: string;
  priceCents: number;
  qty: number;
}

export type Fulfillment = { type: 'delivery'; address: string } | { type: 'pickup'; location: string };

export type OrderStatus = 'placed' | 'cancelled';
export type PaymentStatus = 'unpaid' | 'pending' | 'paid' | 'failed';

export interface OrderSummary {
  id: string;
  lines: OrderLine[];
  subtotalCents: number;
  discountCents: number;
  giftWrapCents: number;
  giftCardCents: number;
  totalCents: number;
  coupon: string | null;
  giftWrap: boolean;
  fulfillment: Fulfillment;
  tags: string[];
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  createdAtMs: number;
}

export interface CreateOrderRequest {
  items: CartItem[];
  coupon?: string;
  giftCardCode?: string;
  giftWrap?: boolean;
  fulfillment?: Fulfillment;
  tags?: string[];
}

export interface Scenario {
  id: string;
  title: string;
  state: string;
  lastResult: string | null;
}

export interface ExportStatus {
  status: 'ready' | 'failed';
  /** The day exported, as YYYY-MM-DD (UTC). */
  forDate: string;
  orderCount: number;
  finishedAtMs: number;
  error: string | null;
}

export interface DeploymentRecord {
  commit: string;
  deployedAtMs: number;
}

export interface WeeklyDigest {
  weekStart: string;
  weekEnd: string;
  orderCount: number;
  units: number;
  revenueCents: number;
  topProducts: { productId: string; name: string; units: number }[];
  finishedAtMs: number;
}
