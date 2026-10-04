import { defineString } from 'firebase-functions/params';
import { logger } from 'firebase-functions/v2';
import * as v1 from 'firebase-functions/v1';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { Timestamp } from 'firebase-admin/firestore';
import { parseProductCsv } from '../../../shared/csv';
import { summarizeOrders, topProducts, type DigestOrder } from '../../../shared/digest';
import { yesterdayUtc } from '../../../shared/export';
import { analyticsDb, db } from '../lib/firebase';
import { requireTeam } from '../lib/guards';
import { fetchJson } from '../lib/http';
import { record, trackOutcome, tracked } from '../lib/track';

/** Where the nightly export is delivered. Set per deployment in functions/.env.<project>. */
const exportUrl = defineString('EXPORT_UPSTREAM_URL', { default: '' });

const UPSTREAM_DEADLINE_MS = 10_000;

export async function runNightlyExport(nowMs: number): Promise<void> {
  const { date, startMs, endMs } = yesterdayUtc(nowMs);
  const status = db.doc('exports/last');
  try {
    const url = exportUrl.value();
    if (!url) throw new Error('EXPORT_UPSTREAM_URL is not configured');
    const snap = await db
      .collection('orders')
      .where('createdAt', '>=', Timestamp.fromMillis(startMs))
      .where('createdAt', '<', Timestamp.fromMillis(endMs))
      .get();
    const orders = snap.docs.map((d) => ({ id: d.id, ...d.data(), createdAt: (d.get('createdAt') as Timestamp).toDate().toISOString() }));
    await fetchJson(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ date, orders }),
      timeoutMs: UPSTREAM_DEADLINE_MS,
    });
    await status.set({ status: 'ready', forDate: date, orderCount: orders.length, finishedAt: Timestamp.now(), error: null });
    await record('nightlyExport', true);
  } catch (err) {
    logger.error('nightly export failed', { date, err });
    await status.set({
      status: 'failed',
      forDate: date,
      orderCount: 0,
      finishedAt: Timestamp.now(),
      error: err instanceof Error ? err.message : String(err),
    });
    await record('nightlyExport', false);
    throw err;
  }
}

const MAX_CSV_BYTES = 200 * 1024;
const DAY_MS = 24 * 60 * 60 * 1000;

async function ordersBetween(startMs: number, endMs: number): Promise<DigestOrder[]> {
  const snap = await db
    .collection('orders')
    .where('createdAt', '>=', Timestamp.fromMillis(startMs))
    .where('createdAt', '<', Timestamp.fromMillis(endMs))
    .get();
  return snap.docs.map((d) => ({
    status: (d.get('status') as string | undefined) ?? 'placed',
    lines: d.get('lines') as DigestOrder['lines'],
    subtotalCents: d.get('subtotalCents') as number,
    discountCents: d.get('discountCents') as number,
    giftWrapCents: (d.get('giftWrapCents') as number | undefined) ?? 0,
  }));
}

export async function runWeeklyDigest(nowMs: number): Promise<void> {
  const endMs = Date.UTC(new Date(nowMs).getUTCFullYear(), new Date(nowMs).getUTCMonth(), new Date(nowMs).getUTCDate());
  const startMs = endMs - 7 * DAY_MS;
  await trackOutcome('weeklyDigest', async () => {
    const orders = await ordersBetween(startMs, endMs);
    const { orderCount, units, revenueCents } = summarizeOrders(orders);
    await db.doc('reports/weeklyDigest').set({
      weekStart: new Date(startMs).toISOString().slice(0, 10),
      weekEnd: new Date(endMs - DAY_MS).toISOString().slice(0, 10),
      orderCount,
      units,
      revenueCents,
      topProducts: topProducts(orders),
      finishedAt: Timestamp.now(),
    });
  });
}

export async function runDailyRollup(nowMs: number): Promise<void> {
  const { date, startMs, endMs } = yesterdayUtc(nowMs);
  await trackOutcome('dailyRollup', async () => {
    const summary = summarizeOrders(await ordersBetween(startMs, endMs));
    // Reporting data lives in the second database, `analytics`, so reports never share a database with orders.
    await analyticsDb.doc(`dailyTotals/${date}`).set({ date, ...summary, computedAt: Timestamp.now() });
  });
}

export const reports = {
  /** Team-only bulk product import. A bad row rejects the whole file so nothing half-imports. */
  importCsv: onCall(
    tracked<{ csv?: unknown }, { imported: number }>('csvImport', async (req) => {
      requireTeam(req);
      const csv = req.data?.csv;
      if (typeof csv !== 'string' || csv.length === 0) throw new HttpsError('invalid-argument', 'Choose a CSV file');
      if (csv.length > MAX_CSV_BYTES) throw new HttpsError('invalid-argument', 'The file is too large (200 KB at most)');
      const { products, errors } = parseProductCsv(csv);
      if (errors.length > 0) throw new HttpsError('invalid-argument', errors.slice(0, 10).join('\n'));
      const batch = db.batch();
      for (const { id, ...rest } of products) batch.set(db.doc(`products/${id}`), rest);
      await batch.commit();
      return { imported: products.length };
    }),
  ),

  /** Weekly sales digest, Mondays 08:00 UTC. First-generation function (scheduler via Pub/Sub). */
  weeklyDigest: v1
    .region('us-central1')
    .pubsub.schedule('0 8 * * 1')
    .timeZone('UTC')
    .onRun(async () => {
      await runWeeklyDigest(Date.now());
    }),

  /** Yesterday's totals into the `analytics` database, daily at 01:30 UTC. */
  dailyRollup: onSchedule({ schedule: '30 1 * * *', timeZone: 'UTC' }, async () => {
    await runDailyRollup(Date.now());
  }),

  /** Exports yesterday's orders every day at 02:00 UTC; the Reports page shows the last outcome. */
  nightlyExport: onSchedule({ schedule: '0 2 * * *', timeZone: 'UTC', timeoutSeconds: 120 }, async () => {
    await runNightlyExport(Date.now());
  }),
};
