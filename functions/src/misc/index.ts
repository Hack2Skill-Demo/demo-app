import { onSchedule } from 'firebase-functions/v2/scheduler';
import { Timestamp } from 'firebase-admin/firestore';
import { db } from '../lib/firebase';
import { trackOutcome } from '../lib/track';

/** Copy the catalog into a single document, so the Shop loads it with one cheap read. */
export async function warmCatalogCache(): Promise<number> {
  const snap = await db.collection('products').orderBy('name').get();
  const products = snap.docs.map((d) => ({ id: d.id, name: d.get('name') as string, priceCents: d.get('priceCents') as number }));
  await db.doc('cache/catalog').set({ products, refreshedAt: Timestamp.now() });
  return products.length;
}

export const misc = {
  /** Every 10 minutes. The Shop falls back to reading products directly if this document is missing or stale. */
  warmCache: onSchedule({ schedule: 'every 10 minutes' }, async () => {
    await trackOutcome('cacheWarmer', warmCatalogCache);
  }),
};
