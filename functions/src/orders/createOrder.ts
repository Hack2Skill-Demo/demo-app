import { logger } from 'firebase-functions/v2';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { Timestamp } from 'firebase-admin/firestore';
import { computeTotals, CouponError, type Coupon } from '../../../shared/pricing';
import type { OrderLine } from '../../../shared/types';
import { db } from '../lib/firebase';
import { requireGrant } from '../lib/guards';
import { tracked } from '../lib/track';
import { orderEventFor } from './orderEvents';
import { parseCreateOrder } from './model';

/** Prices come from the catalog, never from the client. A gift card is charged in the same transaction as the order. */
export const createOrder = onCall(
  tracked<unknown, { orderId: string; totalCents: number }>('orders-createOrder', async (req) => {
    const customerId = await requireGrant(req);
    const parsed = parseCreateOrder(req.data);

    return db.runTransaction(async (tx) => {
      const snaps = await tx.getAll(...parsed.items.map((i) => db.doc(`products/${i.sku}`)));
      const lines: OrderLine[] = snaps.map((snap, i) => {
        const item = parsed.items[i]!;
        if (!snap.exists) {
          const failure = new HttpsError('invalid-argument', `Unknown product: ${item.sku}`);
          logger.write({ severity: 'ERROR', message: 'Checkout failed', sku: item.sku, reason: 'unknown product', error: failure.stack });
          throw failure;
        }
        const priceCents = snap.get('priceCents');
        if (typeof priceCents !== 'number' || !Number.isInteger(priceCents) || priceCents < 0) {
          throw new HttpsError('failed-precondition', `${snap.get('name') ?? item.sku} has no price and cannot be ordered`);
        }
        return { productId: snap.id, name: String(snap.get('name')), priceCents, qty: item.qty };
      });

      let coupon: Coupon | null = null;
      if (parsed.couponCode) {
        const snap = await tx.get(db.doc(`coupons/${parsed.couponCode}`));
        if (!snap.exists) throw new HttpsError('invalid-argument', 'That coupon does not exist');
        const expiresAt = snap.get('expiresAt') as Timestamp | null;
        coupon = { percentOff: Number(snap.get('percentOff')), expiresAtMs: expiresAt ? expiresAt.toMillis() : null };
      }

      const cardRef = parsed.giftCardCode ? db.doc(`giftCards/${parsed.giftCardCode}`) : null;
      const cardSnap = cardRef ? await tx.get(cardRef) : null;
      if (cardSnap && !cardSnap.exists) throw new HttpsError('invalid-argument', 'That gift card does not exist');

      let totals;
      try {
        totals = computeTotals(lines, coupon, Date.now(), {
          giftWrap: parsed.giftWrap,
          giftCardBalanceCents: cardSnap ? Number(cardSnap.get('balanceCents')) : 0,
        });
      } catch (err) {
        if (err instanceof CouponError) throw new HttpsError('invalid-argument', err.message);
        throw err;
      }

      const ref = db.collection('orders').doc();
      const now = Timestamp.now();
      tx.set(ref, {
        customerId,
        lines,
        ...totals,
        couponCode: parsed.couponCode ?? null,
        // Kept so the nightly backfill can recompute the discount if a total ever drifts.
        couponPercentOff: coupon?.percentOff ?? null,
        giftCardCode: totals.giftCardCents > 0 ? parsed.giftCardCode : null,
        giftWrap: parsed.giftWrap ?? null,
        giftNote: parsed.giftNote ?? null,
        fulfillment: parsed.fulfillment ?? null,
        tags: parsed.tags ?? null,
        status: 'placed',
        payment: { status: totals.totalCents === 0 ? 'paid' : 'unpaid', amountCents: totals.totalCents },
        createdAt: now,
      });
      const event = orderEventFor(parsed, ref.id, customerId, now);
      if (event) tx.set(db.collection('orderEvents').doc(), event);
      if (cardRef && cardSnap && totals.giftCardCents > 0) {
        tx.update(cardRef, { balanceCents: Number(cardSnap.get('balanceCents')) - totals.giftCardCents });
      }
      return { orderId: ref.id, totalCents: totals.totalCents };
    });
  }),
);
