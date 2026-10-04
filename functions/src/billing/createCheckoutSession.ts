import { defineString } from 'firebase-functions/params';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { Timestamp } from 'firebase-admin/firestore';
import { chargeAmountCents, computeTotals, CouponError, type Coupon, type StoredOrderPricing } from '../../../shared/pricing';
import { db } from '../lib/firebase';
import { requireGrant } from '../lib/guards';
import { fetchJson } from '../lib/http';
import { tracked } from '../lib/track';
import { loadOwnOrder, parseCreateOrder } from '../orders/model';

/** Base URL of the payment provider, set per deployment in functions/.env.<project>. */
const providerUrl = defineString('PAYMENT_PROVIDER_URL', { default: '' });

/** The amount for a cart that has no order yet: priced from the catalog with the same helpers checkout uses. */
async function amountForItems(data: unknown): Promise<number> {
  const parsed = parseCreateOrder({ ...(data as object), pickup: true });
  const snaps = await db.getAll(...parsed.items.map((i) => db.doc(`products/${i.sku}`)));
  const lines = snaps.map((snap, i) => {
    const priceCents = snap.get('priceCents');
    if (!snap.exists || typeof priceCents !== 'number') throw new HttpsError('invalid-argument', `Cannot price ${parsed.items[i]!.sku}`);
    return { priceCents, qty: parsed.items[i]!.qty };
  });
  let coupon: Coupon | null = null;
  if (parsed.couponCode) {
    const snap = await db.doc(`coupons/${parsed.couponCode}`).get();
    if (!snap.exists) throw new HttpsError('invalid-argument', 'That coupon does not exist');
    const expiresAt = snap.get('expiresAt') as Timestamp | null;
    coupon = { percentOff: Number(snap.get('percentOff')), expiresAtMs: expiresAt ? expiresAt.toMillis() : null };
  }
  try {
    return computeTotals(lines, coupon, Date.now(), { giftWrap: parsed.giftWrap }).totalCents;
  } catch (err) {
    if (err instanceof CouponError) throw new HttpsError('invalid-argument', err.message);
    throw err;
  }
}

export const createCheckoutSession = onCall(
  tracked<{ orderId?: unknown; items?: unknown }, { checkoutUrl: string }>('billing-createCheckoutSession', async (req) => {
    const uid = await requireGrant(req);

    // Either an existing unpaid order, or a cart (`{ items, couponCode? }`) that is paid for before the order is placed.
    let amountCents: number;
    let orderRef = null as FirebaseFirestore.DocumentReference | null;
    if (req.data?.orderId !== undefined) {
      const snap = await loadOwnOrder(req.data.orderId, uid);
      if (snap.get('status') === 'cancelled') throw new HttpsError('failed-precondition', 'This order was cancelled');
      if (snap.get('payment.status') === 'paid') throw new HttpsError('failed-precondition', 'This order is already paid');
      amountCents = chargeAmountCents(snap.data() as StoredOrderPricing);
      orderRef = snap.ref;
    } else {
      amountCents = await amountForItems(req.data);
    }
    if (amountCents <= 0) throw new HttpsError('failed-precondition', 'Nothing to pay');

    const base = providerUrl.value().replace(/\/+$/, '');
    if (!base) throw new HttpsError('failed-precondition', 'Card payment is not configured');
    const origin = req.rawRequest.headers.origin;
    const session = await fetchJson<{ id: string; url: string }>(`${base}/sessions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ orderId: orderRef?.id ?? null, amountCents, currency: 'usd', returnUrl: typeof origin === 'string' ? origin : undefined }),
      timeoutMs: 10_000,
    });
    if (orderRef) await orderRef.update({ 'payment.status': 'pending', 'payment.sessionId': session.id });
    return { checkoutUrl: session.url };
  }),
);
