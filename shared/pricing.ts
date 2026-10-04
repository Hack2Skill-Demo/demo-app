/**
 * Money is integer cents everywhere, so totals never pick up floating-point error. Checkout, billing and
 * the nightly totals backfill all price through this file; keep the arithmetic here and nowhere else.
 */
export interface PricedLine {
  priceCents: number;
  qty: number;
}

export interface Coupon {
  percentOff: number;
  /** Epoch milliseconds, or null for a coupon that never expires. */
  expiresAtMs: number | null;
}

export interface Totals {
  subtotalCents: number;
  discountCents: number;
  giftWrapCents: number;
  /** How much of the bill a gift card pays. */
  giftCardCents: number;
  /** What is left to pay by card. */
  totalCents: number;
}

export interface PricingOptions {
  giftWrap?: boolean;
  giftCardBalanceCents?: number;
}

export const GIFT_WRAP_CENTS = 500;

export class CouponError extends Error {}

export function subtotal(lines: readonly PricedLine[]): number {
  return lines.reduce((sum, line) => sum + line.priceCents * line.qty, 0);
}

export function discountFor(subtotalCents: number, percentOff: number): number {
  return Math.round((subtotalCents * percentOff) / 100);
}

export function computeTotals(
  lines: readonly PricedLine[],
  coupon: Coupon | null,
  nowMs: number,
  options: PricingOptions = {},
): Totals {
  const subtotalCents = subtotal(lines);
  let discountCents = 0;
  if (coupon) {
    if (coupon.expiresAtMs !== null && coupon.expiresAtMs <= nowMs) throw new CouponError('This coupon has expired');
    if (!(coupon.percentOff > 0 && coupon.percentOff <= 100)) throw new CouponError('This coupon is not valid');
    discountCents = discountFor(subtotalCents, coupon.percentOff);
  }
  const giftWrapCents = options.giftWrap ? GIFT_WRAP_CENTS : 0;
  const due = subtotalCents - discountCents + giftWrapCents;
  const giftCardCents = Math.min(Math.max(options.giftCardBalanceCents ?? 0, 0), due);
  return { subtotalCents, discountCents, giftWrapCents, giftCardCents, totalCents: due - giftCardCents };
}

/** The parts of a stored order the backfill needs. Orders from before gift cards lack the gift fields. */
export interface StoredOrderPricing {
  lines: readonly PricedLine[];
  discountCents: number;
  couponPercentOff?: number | null;
  giftWrapCents?: number;
  giftCardCents?: number;
  subtotalCents: number;
  totalCents: number;
}

/** Recompute an order's subtotal and total from its lines. Returns null when the stored numbers are already right. */
export function correctedTotals(order: StoredOrderPricing): { subtotalCents: number; discountCents: number; totalCents: number } | null {
  const subtotalCents = subtotal(order.lines);
  const discountCents =
    typeof order.couponPercentOff === 'number' ? discountFor(subtotalCents, order.couponPercentOff) : order.discountCents;
  const totalCents = subtotalCents - discountCents + (order.giftWrapCents ?? 0) - (order.giftCardCents ?? 0);
  if (subtotalCents === order.subtotalCents && discountCents === order.discountCents && totalCents === order.totalCents) return null;
  return { subtotalCents, discountCents, totalCents };
}

/** Billing refuses to charge an order whose stored numbers do not add up. */
export function chargeAmountCents(order: StoredOrderPricing): number {
  if (correctedTotals(order) !== null) throw new Error('Order totals do not add up');
  return order.totalCents;
}
