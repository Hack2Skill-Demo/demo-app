import { logger } from 'firebase-functions/v2';
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

/** One line of what the customer sees on the provider's payment page. */
function lineText(name: string, priceCents: number, qty: number): string {
  const digits = priceCents.toFixed(0).padStart(3, '0');
  return `${qty} x ${name} at $${digits.slice(0, -2)}.${digits.slice(-2)}`;
}

/** The amount for a cart that has no order yet: priced from the catalog with the same helpers checkout uses. */
async function amountForItems(data: unknown): Promise<{ amountCents: number; description: string }> {
  const parsed = parseCreateOrder({ ...(data as object), pickup: true });
  const snaps = await db.getAll(...parsed.items.map((i) => db.doc(`products/${i.sku}`)));
  const lines = snaps.map((snap, i) => {
    const { sku, qty } = parsed.items[i]!;
    if (!snap.exists) throw new HttpsError('invalid-argument', `Cannot price ${sku}`);
    const priceCents = snap.get('priceCents');
    return { priceCents, qty, text: lineText(String(snap.get('name')), priceCents, qty) };
  });
  let coupon: Coupon | null = null;
  if (parsed.couponCode) {
    const snap = await db.doc(`coupons/${parsed.couponCode}`).get();
    if (!snap.exists) throw new HttpsError('invalid-argument', 'That coupon does not exist');
    const expiresAt = snap.get('expiresAt') as Timestamp | null;
    coupon = { percentOff: Number(snap.get('percentOff')), expiresAtMs: expiresAt ? expiresAt.toMillis() : null };
  }
  try {
    const { totalCents } = computeTotals(lines, coupon, Date.now(), { giftWrap: parsed.giftWrap });
    return { amountCents: totalCents, description: lines.map((l) => l.text).join(', ') };
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
    let description: string;
    let orderRef = null as FirebaseFirestore.DocumentReference | null;
    if (req.data?.orderId !== undefined) {
      const snap = await loadOwnOrder(req.data.orderId, uid);
      if (snap.get('status') === 'cancelled') throw new HttpsError('failed-precondition', 'This order was cancelled');
      if (snap.get('payment.status') === 'paid') throw new HttpsError('failed-precondition', 'This order is already paid');
      amountCents = chargeAmountCents(snap.data() as StoredOrderPricing);
      description = (snap.get('lines') as { name: string; priceCents: number; qty: number }[])
        .map((l) => lineText(l.name, l.priceCents, l.qty))
        .join(', ');
      orderRef = snap.ref;
    } else {
      ({ amountCents, description } = await amountForItems(req.data));
    }
    if (amountCents <= 0) throw new HttpsError('failed-precondition', 'Nothing to pay');

    const base = providerUrl.value().replace(/\/+$/, '');
    if (!base) throw new HttpsError('failed-precondition', 'Card payment is not configured');
    const origin = req.rawRequest.headers.origin;
    const request = {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        orderId: orderRef?.id ?? null,
        amountCents,
        currency: 'usd',
        description,
        returnUrl: typeof origin === 'string' ? origin : undefined,
      }),
      timeoutMs: 10_000,
    };
    let session: { id: string; url: string };
    try {
      session = await fetchJson<{ id: string; url: string }>(`${base}/sessions`, request);
    } catch (err) {
      if (!(err instanceof HttpsError) || err.code !== 'unavailable') throw err;
      logger.error(`billing-createCheckoutSession attempt failed, retrying: ${err.message}`, { err });
      await new Promise((resolve) => setTimeout(resolve, 400));
      session = await fetchJson<{ id: string; url: string }>(`${base}/sessions`, request);
    }
    if (orderRef) await orderRef.update({ 'payment.status': 'pending', 'payment.sessionId': session.id });
    return { checkoutUrl: session.url };
  }),
);
