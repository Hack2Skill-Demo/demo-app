import { onCall } from 'firebase-functions/v2/https';
import type { ShippingAddress } from '../../../shared/types';
import { requireGrant } from '../lib/guards';
import { tracked } from '../lib/track';
import { loadOwnOrder } from './model';
import { toOrderDetails, type OrderDetails } from './orderView';

/** Details of one order, including whether it is for delivery or pickup. */
export const getOrder = onCall(
  tracked<{ orderId?: unknown }, { order: OrderDetails }>('orders-getOrder', async (req) => {
    const uid = await requireGrant(req);
    const snap = await loadOwnOrder(req.data?.orderId, uid);
    const address = snap.get('fulfillment.shippingAddress') as ShippingAddress | undefined;
    return { order: toOrderDetails(snap, address ? `${address.line1}, ${address.city}` : '') };
  }),
);
