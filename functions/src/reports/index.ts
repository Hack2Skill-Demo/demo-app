import { defineString } from 'firebase-functions/params';
import { logger } from 'firebase-functions/v2';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { Timestamp } from 'firebase-admin/firestore';
import { yesterdayUtc } from '../../../shared/export';
import { db } from '../lib/firebase';
import { fetchJson } from '../lib/http';
import { record } from '../lib/track';

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

export const reports = {
  /** Exports yesterday's orders every day at 02:00 UTC; the Reports page shows the last outcome. */
  nightlyExport: onSchedule({ schedule: '0 2 * * *', timeZone: 'UTC', timeoutSeconds: 120 }, async () => {
    await runNightlyExport(Date.now());
  }),
};
