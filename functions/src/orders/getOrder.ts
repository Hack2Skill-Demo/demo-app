import { onCall } from 'firebase-functions/v2/https';
import type { OrderSummary } from '../../../shared/types';
import { requireGrant } from '../lib/guards';
import { tracked } from '../lib/track';
import { loadOwnOrder } from './model';
import { toSummary } from './orderView';

/** Details of one order, including whether it is for delivery or pickup. */
export const getOrder = onCall(
  tracked<{ orderId?: unknown }, { order: OrderSummary }>('orders-getOrder', async (req) => {
    const uid = await requireGrant(req);
    return { order: toSummary(await loadOwnOrder(req.data?.orderId, uid)) };
  }),
);
