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

export interface OrderSummary {
  id: string;
  lines: OrderLine[];
  subtotalCents: number;
  discountCents: number;
  totalCents: number;
  coupon: string | null;
  createdAtMs: number;
}

export interface CreateOrderRequest {
  items: CartItem[];
  coupon?: string;
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
