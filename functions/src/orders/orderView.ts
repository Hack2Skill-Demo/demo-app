import type { DocumentSnapshot, Timestamp } from 'firebase-admin/firestore';
import type { Fulfillment, OrderLine, OrderStatus, OrderSummary, PaymentStatus } from '../../../shared/types';
import { PICKUP_LOCATION } from './model';

/** What a customer sees of an order. */
export function toSummary(d: DocumentSnapshot): OrderSummary {
  return {
    id: d.id,
    lines: d.get('lines') as OrderLine[],
    subtotalCents: d.get('subtotalCents') as number,
    discountCents: d.get('discountCents') as number,
    giftWrapCents: (d.get('giftWrapCents') as number | undefined) ?? 0,
    giftCardCents: (d.get('giftCardCents') as number | undefined) ?? 0,
    totalCents: d.get('totalCents') as number,
    couponCode: (d.get('couponCode') as string | null) ?? null,
    giftWrap: d.get('giftWrap') === true,
    giftNote: (d.get('giftNote') as string | null) ?? null,
    fulfillment: (d.get('fulfillment') as Fulfillment | undefined) ?? { type: 'pickup', location: PICKUP_LOCATION },
    tags: (d.get('tags') as string[] | undefined) ?? [],
    status: (d.get('status') as OrderStatus | undefined) ?? 'placed',
    paymentStatus: (d.get('payment.status') as PaymentStatus | undefined) ?? 'unpaid',
    createdAt: (d.get('createdAt') as Timestamp).toDate().toISOString(),
  };
}
