import { logger } from 'firebase-functions/v2';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { correctedTotals, type StoredOrderPricing } from '../../../shared/pricing';
import { db } from '../lib/firebase';
import { trackOutcome } from '../lib/track';

const PAGE = 300;

/** Walk every order and fix any whose stored subtotal, discount or total no longer matches its lines. Returns how many were fixed. */
export async function backfillTotals(): Promise<number> {
  let fixed = 0;
  let last: FirebaseFirestore.QueryDocumentSnapshot | undefined;
  for (;;) {
    let q = db.collection('orders').orderBy('__name__').limit(PAGE);
    if (last) q = q.startAfter(last);
    const page = await q.get();
    if (page.empty) break;
    const batch = db.batch();
    for (const doc of page.docs) {
      const fix = correctedTotals(doc.data() as StoredOrderPricing);
      if (fix) {
        logger.warn('order totals corrected', { orderId: doc.id, was: doc.get('totalCents'), now: fix.totalCents });
        batch.update(doc.ref, fix);
        fixed++;
      }
    }
    await batch.commit();
    last = page.docs[page.docs.length - 1];
    if (page.size < PAGE) break;
  }
  return fixed;
}

export const admin = {
  /** Nightly at 03:30 UTC: recompute order totals from their lines. */
  backfillTotals: onSchedule({ schedule: '30 3 * * *', timeZone: 'UTC', timeoutSeconds: 540 }, async () => {
    const fixed = await trackOutcome('backfill', backfillTotals);
    logger.info('totals backfill finished', { fixed });
  }),
};
