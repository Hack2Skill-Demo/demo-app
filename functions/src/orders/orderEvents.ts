import type { Timestamp } from 'firebase-admin/firestore';

export interface OrderEvent {
  orderId: string;
  customerId: string;
  type: 'gift-wrapped';
  couponCode: string | null;
  at: Timestamp;
}

/** Gift-wrapped orders leave an `orderEvents` entry for the packing desk, carrying the coupon the order used. Others leave none. */
export function orderEventFor(
  order: { giftWrap: boolean; couponCode?: string },
  orderId: string,
  customerId: string,
  at: Timestamp,
): OrderEvent | null {
  if (!order.giftWrap) return null;
  return { orderId, customerId, type: 'gift-wrapped', couponCode: order.couponCode ?? null, at };
}
