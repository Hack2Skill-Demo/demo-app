export const INVOICE_LABELS = ['Invoice', 'Order', 'Date', 'Item', 'Qty', 'Price', 'Subtotal', 'Discount', 'Total'] as const;
export type InvoiceLabel = (typeof INVOICE_LABELS)[number];

export interface InvoiceLine {
  productId: string;
  name: string;
  priceCents: number;
  qty: number;
}

/** The request body of POST /render: an invoice whose words are already in the customer's language. */
export interface InvoiceData {
  orderId: string;
  /** ISO 8601. */
  createdAt: string;
  lines: InvoiceLine[];
  subtotalCents: number;
  discountCents: number;
  giftWrapCents: number;
  giftCardCents: number;
  totalCents: number;
  labels: Record<InvoiceLabel, string>;
  /** Product names, translated, in the same order as `lines`. */
  names: string[];
}
