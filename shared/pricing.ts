/** Money is integer cents everywhere, so totals never pick up floating-point error. */
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
  totalCents: number;
}

export class CouponError extends Error {}

export function subtotal(lines: readonly PricedLine[]): number {
  return lines.reduce((sum, line) => sum + line.priceCents * line.qty, 0);
}

export function computeTotals(lines: readonly PricedLine[], coupon: Coupon | null, nowMs: number): Totals {
  const subtotalCents = subtotal(lines);
  if (!coupon) return { subtotalCents, discountCents: 0, totalCents: subtotalCents };
  if (coupon.expiresAtMs !== null && coupon.expiresAtMs <= nowMs) throw new CouponError('This coupon has expired');
  if (!(coupon.percentOff > 0 && coupon.percentOff <= 100)) throw new CouponError('This coupon is not valid');
  const discountCents = Math.round((subtotalCents * coupon.percentOff) / 100);
  return { subtotalCents, discountCents, totalCents: subtotalCents - discountCents };
}
