import { onCall } from 'firebase-functions/v2/https';
import { searchWords, type ProductSearch } from './searchWords';
import { db } from '../lib/firebase';
import { requireGrant } from '../lib/guards';
import { tracked } from '../lib/track';

/** How many products a search reads: the demo catalog is a handful, plus whatever the team imports. */
const MAX_READ = 200;
/** How many products a search answers with. */
const MAX_RESULTS = 20;

export interface ProductMatch {
  id: string;
  name: string;
  priceCents: number;
}

/**
 * Search the catalog by name: every word of the query must appear in the product's name, in any order. An empty
 * query lists the catalog. Products with no price are never shown, as on the Shop page.
 */
export const searchProducts = onCall(
  tracked<ProductSearch, { products: ProductMatch[] }>('catalog-searchProducts', async (req) => {
    await requireGrant(req);
    const words = searchWords(req.data);
    const snap = await db.collection('products').limit(MAX_READ).get();
    const products: ProductMatch[] = [];
    for (const doc of snap.docs) {
      const name = doc.get('name');
      const priceCents = doc.get('priceCents');
      if (typeof name !== 'string' || typeof priceCents !== 'number') continue;
      const lower = name.toLowerCase();
      if (words === null || words.every((word) => lower.includes(word))) products.push({ id: doc.id, name, priceCents });
    }
    products.sort((a, b) => a.name.localeCompare(b.name));
    return { products: products.slice(0, MAX_RESULTS) };
  }),
);
