import { HttpsError, onCall } from 'firebase-functions/v2/https';
import type { OrderStatus, OrderSummary } from '../../../shared/types';
import { db } from '../lib/firebase';
import { isTeam, requireGrant } from '../lib/guards';
import { tracked } from '../lib/track';
import { parseTag } from './model';
import { toSummary } from './orderView';

const SEARCH_SCAN = 200;
const SEARCH_RESULTS = 50;

function parseStatus(raw: unknown): OrderStatus | undefined {
  if (raw === undefined) return undefined;
  if (raw !== 'placed' && raw !== 'cancelled') throw new HttpsError('invalid-argument', 'Status is placed or cancelled');
  return raw;
}

/**
 * The customer's last 10 orders, newest first. Team members can pass a status to see the shop's latest placed or
 * cancelled orders instead.
 */
export const listRecentOrders = onCall(
  tracked<{ status?: unknown } | undefined, { orders: OrderSummary[] }>('orders-listRecentOrders', async (req) => {
    const uid = await requireGrant(req);
    const status = parseStatus(req.data?.status);
    if (status && !isTeam(req)) throw new HttpsError('permission-denied', 'Team members only');
    const orders = db.collection('orders');
    const query = status ? orders.where('status', '==', status) : orders.where('customerId', '==', uid);
    const snap = await query.orderBy('createdAt', 'desc').limit(10).get();
    return { orders: snap.docs.map(toSummary) };
  }),
);

/**
 * Search the customer's orders by tag, newest first. The query is the shop-wide (tags array-contains, createdAt desc)
 * index; the customer's own orders are picked out of the newest matches here, so the index needs no customer field.
 */
export const searchOrders = onCall(
  tracked<{ tag?: unknown }, { orders: OrderSummary[] }>('orders-searchOrders', async (req) => {
    const uid = await requireGrant(req);
    const tag = parseTag(req.data?.tag);
    const snap = await db.collection('orders').where('tags', 'array-contains', tag).orderBy('createdAt', 'desc').limit(SEARCH_SCAN).get();
    const mine = snap.docs.filter((d) => d.get('customerId') === uid).slice(0, SEARCH_RESULTS);
    return { orders: mine.map(toSummary) };
  }),
);
