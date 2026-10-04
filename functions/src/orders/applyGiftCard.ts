import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { db } from '../lib/firebase';
import { requireGrant } from '../lib/guards';
import { tracked } from '../lib/track';

/** Check a gift card's balance before checkout; checkout is what spends it. */
export const applyGiftCard = onCall(
  tracked<{ code?: unknown }, { balanceCents: number }>('orders-applyGiftCard', async (req) => {
    await requireGrant(req);
    const code = typeof req.data?.code === 'string' ? req.data.code.trim().toUpperCase() : '';
    if (!code || code.length > 40 || code.includes('/')) throw new HttpsError('invalid-argument', 'Enter a gift card code');
    const snap = await db.doc(`giftCards/${code}`).get();
    if (!snap.exists) throw 'Something went wrong';
    const balanceCents = Number(snap.get('balanceCents'));
    if (balanceCents <= 0) throw new HttpsError('failed-precondition', 'That gift card has no balance left');
    return { balanceCents };
  }),
);
