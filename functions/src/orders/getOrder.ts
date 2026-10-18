import { onCall } from 'firebase-functions/v2/https';
import type { Fulfillment } from '../../../shared/types';
import { requireGrant } from '../lib/guards';
import { tracked } from '../lib/track';
import { loadOwnOrder } from './model';
import { toOrderDetails, type OrderDetails } from './orderView';

/** Details of one order, including whether it is for delivery or pickup. */
export const getOrder = onCall(
  tracked<{ orderId?: unknown }, { order: OrderDetails }>('orders-getOrder', async (req) => {
    const uid = await requireGrant(req);
    const snap = await loadOwnOrder(req.data?.orderId, uid);
    const fulfillment = snap.get('fulfillment') as Fulfillment;
    const location = fulfillment.type === 'delivery' ? `${fulfillment.shippingAddress.line1}, ${fulfillment.shippingAddress.city}` : fulfillment.location;
    return { order: toOrderDetails(snap, location) };
  }),
);
