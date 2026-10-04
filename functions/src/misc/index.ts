import { onSchedule } from 'firebase-functions/v2/scheduler';
import { Timestamp } from 'firebase-admin/firestore';
import { db } from '../lib/firebase';
import { trackOutcome } from '../lib/track';

/** Copy the catalog into a single document, so the Shop loads it with one cheap read. Products without a price cannot be sold, so they are left out. */
export async function warmCatalogCache(): Promise<number> {
  const snap = await db.collection('products').orderBy('name').get();
  const products: { id: string; name: string; priceCents: number }[] = [];
  for (const d of snap.docs) {
    const priceCents = d.get('priceCents');
    if (typeof priceCents !== 'number') continue;
    products.push({ id: d.id, name: d.get('name') as string, priceCents });
  }
  const batch = db.batch();
  batch.set(db.doc('cache/catalog'), { products, refreshedAt: Timestamp.now() });
  // One small document per lower-cased name, so a product can be opened by name without scanning the list.
  for (const p of products) batch.set(db.doc(`cache/catalog/byName/${p.name.toLowerCase()}`), { id: p.id });
  await batch.commit();
  return products.length;
}

export const misc = {
  /** Every 10 minutes. The Shop falls back to reading products directly if this document is missing or stale. */
  warmCache: onSchedule({ schedule: 'every 10 minutes' }, async () => {
    await trackOutcome('cacheWarmer', warmCatalogCache);
  }),
};
