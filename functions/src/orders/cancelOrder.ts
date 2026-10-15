import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import type { DocumentSnapshot } from 'firebase-admin/firestore';
import { db } from '../lib/firebase';
import { requireGrant } from '../lib/guards';
import { tracked } from '../lib/track';
import { cancelTransition, markCancelled } from './cancelTransition';
import { loadOwnOrder } from './model';

function giftCardFor(code: string): Promise<DocumentSnapshot> {
  return db.doc(`giftCards/${code}`).get();
}

/** Cancel an unpaid order and give any gift card amount back. Cancelling twice is harmless. */
export const cancelOrder = onCall(
  tracked<{ orderId?: unknown }, { cancelled: true }>('orders-cancelOrder', async (req) => {
    const uid = await requireGrant(req);
    const snap = await loadOwnOrder(req.data?.orderId, uid);
    const decision = cancelTransition({
      status: snap.get('status'),
      paymentStatus: snap.get('payment.status'),
      totalCents: Number(snap.get('totalCents')),
      giftCardCode: snap.get('giftCardCode'),
      giftCardCents: Number(snap.get('giftCardCents') ?? 0),
    });
    if (decision.kind === 'already-cancelled') return { cancelled: true };
    if (decision.kind === 'refuse') throw new HttpsError('failed-precondition', decision.reason);

    if (decision.giftCardCode && decision.refundCents > 0) {
      const card = await giftCardFor(decision.giftCardCode);
      if (!card.exists) {
        logger.error('Gift card refund failed', { orderId: snap.id, giftCardCode: decision.giftCardCode });
        throw new HttpsError('not-found', 'That gift card does not exist');
      }
      await card.ref.update({ balanceCents: Number(card.get('balanceCents')) + decision.refundCents });
    }
    await markCancelled(snap);
    return { cancelled: true };
  }),
);
