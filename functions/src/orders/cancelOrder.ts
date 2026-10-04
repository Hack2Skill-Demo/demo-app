import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { Timestamp } from 'firebase-admin/firestore';
import { db } from '../lib/firebase';
import { requireGrant } from '../lib/guards';
import { tracked } from '../lib/track';
import { cancelTransition } from './cancelTransition';
import { loadOwnOrder } from './model';

/** Cancel an unpaid order and give any gift card amount back. Cancelling twice is harmless. */
export const cancelOrder = onCall(
  tracked<{ orderId?: unknown }, { cancelled: true }>('orders-cancelOrder', async (req) => {
    const uid = await requireGrant(req);
    const first = await loadOwnOrder(req.data?.orderId, uid);
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(first.ref);
      const decision = cancelTransition({
        status: snap.get('status'),
        paymentStatus: snap.get('payment.status'),
        totalCents: Number(snap.get('totalCents')),
        giftCardCode: snap.get('giftCardCode'),
        giftCardCents: Number(snap.get('giftCardCents') ?? 0),
      });
      if (decision.kind === 'already-cancelled') return;
      if (decision.kind === 'refuse') throw new HttpsError('failed-precondition', decision.reason);

      const cardRef = decision.giftCardCode && decision.refundCents > 0 ? db.doc(`giftCards/${decision.giftCardCode}`) : null;
      const card = cardRef ? await tx.get(cardRef) : null;
      tx.update(snap.ref, { status: 'cancelled', cancelledAt: Timestamp.now() });
      if (cardRef && card?.exists) tx.update(cardRef, { balanceCents: Number(card.get('balanceCents')) + decision.refundCents });
    });
    return { cancelled: true };
  }),
);
