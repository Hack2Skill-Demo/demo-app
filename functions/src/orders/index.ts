import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { Timestamp } from 'firebase-admin/firestore';
import { computeTotals, CouponError, type Coupon } from '../../../shared/pricing';
import type { CreateOrderRequest, OrderLine, OrderSummary } from '../../../shared/types';
import { db } from '../lib/firebase';
import { requireGrant } from '../lib/guards';
import { tracked } from '../lib/track';

const MAX_DISTINCT_ITEMS = 20;
const MAX_QTY = 20;

export function parseCreateOrder(data: unknown): CreateOrderRequest {
  const body = (data ?? {}) as Partial<CreateOrderRequest>;
  if (!Array.isArray(body.items) || body.items.length === 0 || body.items.length > MAX_DISTINCT_ITEMS) {
    throw new HttpsError('invalid-argument', 'Add between 1 and 20 items to the cart');
  }
  const seen = new Set<string>();
  for (const item of body.items) {
    if (typeof item?.productId !== 'string' || !Number.isInteger(item.qty) || item.qty < 1 || item.qty > MAX_QTY) {
      throw new HttpsError('invalid-argument', `Each quantity must be a whole number from 1 to ${MAX_QTY}`);
    }
    if (seen.has(item.productId)) throw new HttpsError('invalid-argument', 'Each product may appear once');
    seen.add(item.productId);
  }
  if (body.coupon !== undefined && (typeof body.coupon !== 'string' || body.coupon.length > 40)) {
    throw new HttpsError('invalid-argument', 'Coupon is not valid');
  }
  return { items: body.items, coupon: body.coupon?.trim().toUpperCase() || undefined };
}

async function loadCoupon(code: string): Promise<Coupon> {
  const snap = await db.doc(`coupons/${code}`).get();
  if (!snap.exists) throw new HttpsError('invalid-argument', 'That coupon does not exist');
  const expiresAt = snap.get('expiresAt') as Timestamp | null;
  return { percentOff: Number(snap.get('percentOff')), expiresAtMs: expiresAt ? expiresAt.toMillis() : null };
}

export const orders = {
  /** Prices come from the catalog, never from the client. */
  createOrder: onCall(
    tracked<unknown, { orderId: string; totalCents: number }>('checkout', async (req) => {
      const uid = await requireGrant(req);
      const { items, coupon: couponCode } = parseCreateOrder(req.data);

      const refs = items.map((i) => db.doc(`products/${i.productId}`));
      const snaps = await db.getAll(...refs);
      const lines: OrderLine[] = snaps.map((snap, i) => {
        if (!snap.exists) throw new HttpsError('invalid-argument', `Unknown product: ${items[i]!.productId}`);
        return {
          productId: snap.id,
          name: String(snap.get('name')),
          priceCents: Number(snap.get('priceCents')),
          qty: items[i]!.qty,
        };
      });

      const coupon = couponCode ? await loadCoupon(couponCode) : null;
      let totals;
      try {
        totals = computeTotals(lines, coupon, Date.now());
      } catch (err) {
        if (err instanceof CouponError) throw new HttpsError('invalid-argument', err.message);
        throw err;
      }

      const ref = db.collection('orders').doc();
      await ref.set({
        uid,
        lines,
        ...totals,
        coupon: couponCode ?? null,
        status: 'placed',
        createdAt: Timestamp.now(),
      });
      return { orderId: ref.id, totalCents: totals.totalCents };
    }),
  ),

  /** The customer's last 10 orders, newest first. Needs the (uid, createdAt desc) index in firestore.indexes.json. */
  listRecentOrders: onCall(
    tracked<unknown, { orders: OrderSummary[] }>('recentOrders', async (req) => {
      const uid = await requireGrant(req);
      const snap = await db.collection('orders').where('uid', '==', uid).orderBy('createdAt', 'desc').limit(10).get();
      return {
        orders: snap.docs.map((d) => ({
          id: d.id,
          lines: d.get('lines') as OrderLine[],
          subtotalCents: d.get('subtotalCents') as number,
          discountCents: d.get('discountCents') as number,
          totalCents: d.get('totalCents') as number,
          coupon: (d.get('coupon') as string | null) ?? null,
          createdAtMs: (d.get('createdAt') as Timestamp).toMillis(),
        })),
      };
    }),
  ),
};
