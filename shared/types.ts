export interface Product {
  /** The SKU, e.g. `sku-mug`. */
  id: string;
  name: string;
  priceCents: number;
}

export interface CartItem {
  sku: string;
  qty: number;
}

export interface OrderLine {
  productId: string;
  name: string;
  priceCents: number;
  qty: number;
}

export interface ShippingAddress {
  line1: string;
  city: string;
  postalCode: string;
  country: string;
}

export type Fulfillment = { type: 'delivery'; shippingAddress: ShippingAddress } | { type: 'pickup'; location: string };

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
  couponCode: string | null;
  giftWrap: boolean;
  giftNote: string | null;
  fulfillment: Fulfillment;
  tags: string[];
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  /** ISO 8601. */
  createdAt: string;
}

export interface CreateOrderRequest {
  items: CartItem[];
  couponCode?: string;
  giftCardCode?: string;
  giftWrap?: boolean;
  giftNote?: string;
  /** Collect in store. Without it the order needs a `shippingAddress`. */
  pickup?: boolean;
  shippingAddress?: ShippingAddress;
  tags?: string[];
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
