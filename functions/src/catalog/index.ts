import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { db } from '../lib/firebase';
import { requireTeam } from '../lib/guards';

const SAMPLE_PRODUCTS = [
  { id: 'mug', name: 'Enamel mug', priceCents: 1400 },
  { id: 'tote', name: 'Canvas tote bag', priceCents: 2200 },
  { id: 'notebook', name: 'Dotted notebook', priceCents: 900 },
  { id: 'poster', name: 'Screen-printed poster', priceCents: 3500 },
];

export const catalog = {
  /** Team-only and idempotent: puts the sample products and a WELCOME10 coupon in an empty shop. */
  seed: onCall(async (req) => {
    requireTeam(req);
    if (req.data?.confirm !== true) throw new HttpsError('invalid-argument', 'Pass { confirm: true }');
    const batch = db.batch();
    for (const { id, ...rest } of SAMPLE_PRODUCTS) batch.set(db.doc(`products/${id}`), rest);
    batch.set(db.doc('coupons/WELCOME10'), { percentOff: 10, expiresAt: null });
    await batch.commit();
    return { products: SAMPLE_PRODUCTS.length };
  }),
};
