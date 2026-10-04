import { onSchedule } from 'firebase-functions/v2/scheduler';
import { Timestamp } from 'firebase-admin/firestore';
import { db } from '../lib/firebase';
import { trackOutcome } from '../lib/track';

export interface CatalogEntry {
  id: string;
  name: string;
  priceCents: number;
}

/**
 * Only products that have a price are for sale. A product without one (the seed has one on purpose) must be left out:
 * writing `priceCents: undefined` into the cache document is an error in Firestore, and would stop the warmer for good.
 */
export function sellable(products: readonly { id: string; name?: unknown; priceCents?: unknown }[]): CatalogEntry[] {
  return products.flatMap((p) =>
    typeof p.priceCents === 'number' && Number.isInteger(p.priceCents) && typeof p.name === 'string'
      ? [{ id: p.id, name: p.name, priceCents: p.priceCents }]
      : [],
  );
}

/** Copy the catalog into a single document, so the Shop loads it with one cheap read. */
export async function warmCatalogCache(): Promise<number> {
  const snap = await db.collection('products').orderBy('name').get();
  const products = sellable(snap.docs.map((d) => ({ id: d.id, name: d.get('name'), priceCents: d.get('priceCents') })));
  await db.doc('cache/catalog').set({ products, refreshedAt: Timestamp.now() });
  return products.length;
}

export const misc = {
  /** Every 10 minutes. The Shop falls back to reading products directly if this document is missing or stale. */
  warmCache: onSchedule({ schedule: 'every 10 minutes' }, async () => {
    await trackOutcome('cacheWarmer', warmCatalogCache);
  }),
};
