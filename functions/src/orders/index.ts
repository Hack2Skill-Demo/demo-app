import { applyGiftCard } from './applyGiftCard';
import { cancelOrder } from './cancelOrder';
import { createOrder } from './createOrder';
import { getOrder } from './getOrder';
import { listRecentOrders, searchOrders } from './listOrders';

export { parseCreateOrder } from './model';

// Grouped, so the functions deploy as `orders-createOrder` and so on.
export const orders = { createOrder, getOrder, cancelOrder, applyGiftCard, listRecentOrders, searchOrders };
