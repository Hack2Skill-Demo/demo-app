import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { Timestamp } from 'firebase-admin/firestore';
import { computeTotals, CouponError, type Coupon } from '../../../shared/pricing';
import type { OrderLine, OrderSummary } from '../../../shared/types';
import { db } from '../lib/firebase';
import { requireGrant } from '../lib/guards';
import { tracked } from '../lib/track';
import { loadOwnOrder, parseCreateOrder, parseTag, toSummary } from './model';

export { parseCreateOrder } from './model';

export const orders = {
  /** Prices come from the catalog, never from the client. A gift card is charged in the same transaction as the order. */
  createOrder: onCall(
    tracked<unknown, { orderId: string; totalCents: number }>('checkout', async (req) => {
      const uid = await requireGrant(req);
      const parsed = parseCreateOrder(req.data);
      const { items, giftWrap, fulfillment, tags } = parsed;

      return db.runTransaction(async (tx) => {
        const snaps = await tx.getAll(...items.map((i) => db.doc(`products/${i.productId}`)));
        const lines: OrderLine[] = snaps.map((snap, i) => {
          if (!snap.exists) throw new HttpsError('invalid-argument', `Unknown product: ${items[i]!.productId}`);
          return { productId: snap.id, name: String(snap.get('name')), priceCents: Number(snap.get('priceCents')), qty: items[i]!.qty };
        });

        let coupon: Coupon | null = null;
        if (parsed.coupon) {
          const snap = await tx.get(db.doc(`coupons/${parsed.coupon}`));
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
            giftWrap,
            giftCardBalanceCents: cardSnap ? Number(cardSnap.get('balanceCents')) : 0,
          });
        } catch (err) {
          if (err instanceof CouponError) throw new HttpsError('invalid-argument', err.message);
          throw err;
        }

        const ref = db.collection('orders').doc();
        tx.set(ref, {
          uid,
          lines,
          ...totals,
          coupon: parsed.coupon ?? null,
          // Kept so the nightly backfill can recompute the discount if a total ever drifts.
          couponPercentOff: coupon?.percentOff ?? null,
          giftCardCode: totals.giftCardCents > 0 ? parsed.giftCardCode : null,
          giftWrap,
          fulfillment,
          tags,
          status: 'placed',
          payment: { status: totals.totalCents === 0 ? 'paid' : 'unpaid' },
          createdAt: Timestamp.now(),
        });
        if (cardRef && cardSnap && totals.giftCardCents > 0) {
          tx.update(cardRef, { balanceCents: Number(cardSnap.get('balanceCents')) - totals.giftCardCents });
        }
        return { orderId: ref.id, totalCents: totals.totalCents };
      });
    }),
  ),

  /** Check a gift card's balance before checkout. */
  applyGiftCard: onCall(
    tracked<{ code?: unknown }, { balanceCents: number }>('giftCards', async (req) => {
      await requireGrant(req);
      const code = typeof req.data?.code === 'string' ? req.data.code.trim().toUpperCase() : '';
      if (!code || code.length > 40 || code.includes('/')) throw new HttpsError('invalid-argument', 'Enter a gift card code');
      const snap = await db.doc(`giftCards/${code}`).get();
      if (!snap.exists) throw new HttpsError('not-found', 'That gift card does not exist');
      const balanceCents = Number(snap.get('balanceCents'));
      if (balanceCents <= 0) throw new HttpsError('failed-precondition', 'That gift card has no balance left');
      return { balanceCents };
    }),
  ),

  /** The customer's last 10 orders, newest first. Needs the (uid, createdAt desc) index. */
  listRecentOrders: onCall(
    tracked<unknown, { orders: OrderSummary[] }>('recentOrders', async (req) => {
      const uid = await requireGrant(req);
      const snap = await db.collection('orders').where('uid', '==', uid).orderBy('createdAt', 'desc').limit(10).get();
      return { orders: snap.docs.map(toSummary) };
    }),
  ),

  /** Search the customer's orders by tag, newest first. Needs the (uid, tags, createdAt desc) index. */
  searchOrders: onCall(
    tracked<{ tag?: unknown }, { orders: OrderSummary[] }>('searchOrders', async (req) => {
      const uid = await requireGrant(req);
      const tag = parseTag(req.data?.tag);
      const snap = await db
        .collection('orders')
        .where('uid', '==', uid)
        .where('tags', 'array-contains', tag)
        .orderBy('createdAt', 'desc')
        .limit(50)
        .get();
      return { orders: snap.docs.map(toSummary) };
    }),
  ),

  /** Details of one order, including whether it is for delivery or pickup. */
  getOrder: onCall(
    tracked<{ orderId?: unknown }, { order: OrderSummary }>('orderDetails', async (req) => {
      const uid = await requireGrant(req);
      return { order: toSummary(await loadOwnOrder(req.data?.orderId, uid)) };
    }),
  ),

  /** Cancel an unpaid order and give any gift card amount back. */
  cancelOrder: onCall(
    tracked<{ orderId?: unknown }, { cancelled: true }>('cancelOrder', async (req) => {
      const uid = await requireGrant(req);
      const first = await loadOwnOrder(req.data?.orderId, uid);
      await db.runTransaction(async (tx) => {
        const snap = await tx.get(first.ref);
        if (snap.get('status') === 'cancelled') return; // already done: cancelling twice is harmless
        const paid = snap.get('payment.status') === 'paid' && Number(snap.get('totalCents')) > 0;
        if (paid) throw new HttpsError('failed-precondition', 'This order is paid. Contact support for a refund.');
        const code = snap.get('giftCardCode') as string | null;
        const refund = Number(snap.get('giftCardCents') ?? 0);
        const cardRef = code ? db.doc(`giftCards/${code}`) : null;
        const card = cardRef && refund > 0 ? await tx.get(cardRef) : null;
        tx.update(snap.ref, { status: 'cancelled', cancelledAt: Timestamp.now() });
        if (cardRef && card?.exists) tx.update(cardRef, { balanceCents: Number(card.get('balanceCents')) + refund });
      });
      return { cancelled: true };
    }),
  ),
};

