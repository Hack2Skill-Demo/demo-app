export interface DigestOrder {
  status: string;
  lines: { productId: string; name: string; qty: number }[];
  discountCents: number;
  /** What the customer owes for the whole order, gift card included. */
  subtotalCents: number;
  giftWrapCents?: number;
  /** Delivery country as the customer entered it; pickup orders have none. */
  country?: string;
}

export interface SalesSummary {
  orderCount: number;
  units: number;
  /** Subtotal less discounts plus gift wrap: the sale, whatever way it was paid for. */
  revenueCents: number;
  discountCents: number;
}

/** Cancelled orders are not sales. */
export function summarizeOrders(orders: readonly DigestOrder[]): SalesSummary {
  const live = orders.filter((o) => o.status !== 'cancelled');
  return {
    orderCount: live.length,
    units: live.reduce((n, o) => n + o.lines.reduce((m, l) => m + l.qty, 0), 0),
    revenueCents: live.reduce((n, o) => n + o.subtotalCents - o.discountCents + (o.giftWrapCents ?? 0), 0),
    discountCents: live.reduce((n, o) => n + o.discountCents, 0),
  };
}

export function topProducts(orders: readonly DigestOrder[], limit = 5): { productId: string; name: string; units: number }[] {
  const byId = new Map<string, { productId: string; name: string; units: number }>();
  for (const o of orders.filter((o) => o.status !== 'cancelled')) {
    for (const l of o.lines) {
      const cur = byId.get(l.productId) ?? { productId: l.productId, name: l.name, units: 0 };
      cur.units += l.qty;
      byId.set(l.productId, cur);
    }
  }
  return [...byId.values()].sort((a, b) => b.units - a.units || a.productId.localeCompare(b.productId)).slice(0, limit);
}

const regionNames = new Intl.DisplayNames(['en'], { type: 'region' });

/** Where the week's deliveries went, most orders first. Pickup orders have no country. */
export function topCountries(orders: readonly DigestOrder[], limit = 5): { code: string; name: string; orders: number }[] {
  const byCode = new Map<string, number>();
  for (const o of orders.filter((o) => o.status !== 'cancelled')) {
    if (!o.country) continue;
    const code = o.country.toUpperCase();
    byCode.set(code, (byCode.get(code) ?? 0) + 1);
  }
  return [...byCode]
    .map(([code, count]) => ({ code, name: regionNames.of(code) ?? code, orders: count }))
    .sort((a, b) => b.orders - a.orders || a.code.localeCompare(b.code))
    .slice(0, limit);
}
