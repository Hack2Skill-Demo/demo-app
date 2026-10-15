import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { Timestamp } from 'firebase-admin/firestore';
import { db } from '../lib/firebase';
import { requireTeam } from '../lib/guards';
import { searchProducts } from './searchProducts';

/** SKUs are the product document ids. `sku-sample-free` is deliberately priceless; `sku-does-not-exist` deliberately does not exist. */
const PRODUCTS: { id: string; name: string; priceCents?: number }[] = [
  { id: 'sku-mug', name: 'Enamel mug', priceCents: 1400 },
  { id: 'sku-tote', name: 'Canvas tote bag', priceCents: 2200 },
  { id: 'sku-poster', name: 'Screen-printed poster', priceCents: 3500 },
  { id: 'sku-sticker-pack', name: 'Sticker pack', priceCents: 600 },
  { id: 'sku-cable-3m', name: 'Charging cable, 3 m', priceCents: 1999 },
  { id: 'sku-sample-free', name: 'Free sample' },
];
const COUPONS = [
  { code: 'WELCOME10', percentOff: 10 },
  { code: 'THANKS5', percentOff: 5 },
];
const GIFT_CARD = { code: 'GIFT-DEMO-0001', balanceCents: 5000 };

export const catalog = {
  /** Team-only and idempotent: sets the sample products, coupons and gift card. Re-running resets the gift card's balance. */
  seed: onCall(async (req) => {
    requireTeam(req);
    if (req.data?.confirm !== true) throw new HttpsError('invalid-argument', 'Pass { confirm: true }');
    const batch = db.batch();
    for (const { id, ...rest } of PRODUCTS) batch.set(db.doc(`products/${id}`), rest);
    for (const { code, percentOff } of COUPONS) batch.set(db.doc(`coupons/${code}`), { percentOff, expiresAt: null });
    batch.set(db.doc(`giftCards/${GIFT_CARD.code}`), { balanceCents: GIFT_CARD.balanceCents, createdAt: Timestamp.now() });
    await batch.commit();
    return { products: PRODUCTS.length, coupons: COUPONS.length, giftCards: 1 };
  }),
  searchProducts,
};
