import { logger } from 'firebase-functions/v2';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import type { Timestamp } from 'firebase-admin/firestore';
import { correctedTotals, type StoredOrderPricing } from '../../../shared/pricing';
import { db } from '../lib/firebase';
import { requireTeam } from '../lib/guards';
import { trackOutcome, tracked } from '../lib/track';
import { runScheduledJobNow } from '../reports';

const PAGE = 300;

/** Where the backfill remembers how far it got: the creation time of the last order it walked. */
const PROGRESS = 'jobs/backfillTotals';

/**
 * Walk the orders placed since the last run, oldest first, and fix any whose stored subtotal, discount or total no longer
 * matches its lines. Progress is saved page by page, so a run that stops part way picks up where it left off.
 * Returns how many were fixed.
 */
export async function backfillTotals(): Promise<number> {
  const progress = db.doc(PROGRESS);
  let after = (await progress.get()).get('after') as Timestamp | undefined;
  let fixed = 0;
  for (;;) {
    let q = db.collection('orders').orderBy('createdAt').limit(PAGE);
    if (after) q = q.startAfter(after);
    const page = await q.get();
    if (page.empty) break;
    after = page.docs[page.docs.length - 1]!.get('createdAt') as Timestamp;
    await progress.set({ after });
    const batch = db.batch();
    for (const doc of page.docs) {
      const fix = correctedTotals(doc.data() as StoredOrderPricing);
      if (fix) {
        logger.warn('order totals corrected', { orderId: doc.id, was: doc.get('totalCents'), now: fix.totalCents });
        fixed++;
      }
      // The Orders page groups by the first tag, so keep it next to the totals.
      batch.update(doc.ref, { ...fix, primaryTag: (doc.get('tags') as string[])[0] });
    }
    await batch.commit();
    if (page.size < PAGE) break;
  }
  return fixed;
}

/** The scheduled functions a team member may start by hand. */
const JOBS = ['misc-warmCache', 'reports-weeklyDigest', 'reports-dailyRollup', 'admin-backfillTotals'] as const;

export const admin = {
  /** Nightly at 03:30 UTC: recompute order totals from their lines. */
  backfillTotals: onSchedule({ schedule: '30 3 * * *', timeZone: 'UTC', timeoutSeconds: 540 }, async () => {
    const fixed = await trackOutcome('backfill', backfillTotals);
    logger.info('totals backfill finished', { fixed });
  }),

  /** Team-only: start one scheduled function now, through its Cloud Scheduler job, and return at once. */
  runJob: onCall(
    tracked<{ job?: unknown }, { started: true; job: string }>('admin-runJob', async (req) => {
      requireTeam(req);
      const job = JOBS.find((j) => j === req.data?.job);
      if (!job) throw new HttpsError('invalid-argument', `job must be one of: ${JOBS.join(', ')}`);
      await runScheduledJobNow(job);
      return { started: true, job };
    }),
  ),
};
