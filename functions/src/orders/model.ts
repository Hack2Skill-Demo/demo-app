import { HttpsError } from 'firebase-functions/v2/https';
import type { DocumentSnapshot, Timestamp } from 'firebase-admin/firestore';
import type { CreateOrderRequest, Fulfillment, OrderLine, OrderStatus, OrderSummary, PaymentStatus } from '../../../shared/types';
import { db } from '../lib/firebase';

const MAX_DISTINCT_ITEMS = 20;
const MAX_QTY = 20;
const MAX_TAGS = 5;
const TAG = /^[a-z0-9][a-z0-9-]{0,19}$/;
const DEFAULT_PICKUP = 'Main Street store';

export function parseTag(raw: unknown): string {
  const tag = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  if (!TAG.test(tag)) throw new HttpsError('invalid-argument', 'Tags are 1 to 20 letters, digits or dashes');
  return tag;
}

function parseFulfillment(raw: unknown): Fulfillment {
  if (raw === undefined) return { type: 'pickup', location: DEFAULT_PICKUP };
  const f = raw as Partial<Record<string, unknown>>;
  if (f.type === 'pickup') return { type: 'pickup', location: DEFAULT_PICKUP };
  if (f.type === 'delivery') {
    const address = typeof f.address === 'string' ? f.address.trim() : '';
    if (address.length < 5 || address.length > 200) throw new HttpsError('invalid-argument', 'Enter a delivery address');
    return { type: 'delivery', address };
  }
  throw new HttpsError('invalid-argument', 'Choose delivery or pickup');
}

export interface ParsedOrder extends Required<Pick<CreateOrderRequest, 'items' | 'giftWrap' | 'fulfillment' | 'tags'>> {
  coupon?: string;
  giftCardCode?: string;
}

export function parseCreateOrder(data: unknown): ParsedOrder {
  const body = (data ?? {}) as Partial<CreateOrderRequest>;
  if (!Array.isArray(body.items) || body.items.length === 0 || body.items.length > MAX_DISTINCT_ITEMS) {
    throw new HttpsError('invalid-argument', 'Add between 1 and 20 items to the cart');
  }
  const seen = new Set<string>();
  for (const item of body.items) {
    if (typeof item?.productId !== 'string' || !Number.isInteger(item.qty) || item.qty < 1 || item.qty > MAX_QTY) {
      throw new HttpsError('invalid-argument', `Each quantity must be a whole number from 1 to ${MAX_QTY}`);
    }
    if (seen.has(item.productId)) throw new HttpsError('invalid-argument', 'Each product may appear once');
    seen.add(item.productId);
  }
  if (body.coupon !== undefined && (typeof body.coupon !== 'string' || body.coupon.length > 40)) {
    throw new HttpsError('invalid-argument', 'Coupon is not valid');
  }
  if (body.giftCardCode !== undefined && (typeof body.giftCardCode !== 'string' || body.giftCardCode.length > 40)) {
    throw new HttpsError('invalid-argument', 'Gift card is not valid');
  }
  if (body.tags !== undefined && (!Array.isArray(body.tags) || body.tags.length > MAX_TAGS)) {
    throw new HttpsError('invalid-argument', `At most ${MAX_TAGS} tags`);
  }
  return {
    items: body.items,
    coupon: body.coupon?.trim().toUpperCase() || undefined,
    giftCardCode: body.giftCardCode?.trim().toUpperCase() || undefined,
    giftWrap: body.giftWrap === true,
    fulfillment: parseFulfillment(body.fulfillment),
    tags: [...new Set((body.tags ?? []).map(parseTag))],
  };
}

export function toSummary(d: DocumentSnapshot): OrderSummary {
  return {
    id: d.id,
    lines: d.get('lines') as OrderLine[],
    subtotalCents: d.get('subtotalCents') as number,
    discountCents: d.get('discountCents') as number,
    giftWrapCents: (d.get('giftWrapCents') as number | undefined) ?? 0,
    giftCardCents: (d.get('giftCardCents') as number | undefined) ?? 0,
    totalCents: d.get('totalCents') as number,
    coupon: (d.get('coupon') as string | null) ?? null,
    giftWrap: d.get('giftWrap') === true,
    // Orders from before delivery and pickup existed were all collected in store.
    fulfillment: (d.get('fulfillment') as Fulfillment | undefined) ?? { type: 'pickup', location: DEFAULT_PICKUP },
    tags: (d.get('tags') as string[] | undefined) ?? [],
    status: ((d.get('status') as OrderStatus | undefined) ?? 'placed'),
    paymentStatus: ((d.get('payment.status') as PaymentStatus | undefined) ?? 'unpaid'),
    createdAtMs: (d.get('createdAt') as Timestamp).toMillis(),
  };
}

/** Load an order the caller owns. Someone else's order looks the same as a missing one. */
export async function loadOwnOrder(orderId: unknown, uid: string): Promise<DocumentSnapshot> {
  if (typeof orderId !== 'string' || !orderId || orderId.includes('/')) throw new HttpsError('invalid-argument', 'orderId is required');
  const snap = await db.doc(`orders/${orderId}`).get();
  if (!snap.exists || snap.get('uid') !== uid) throw new HttpsError('not-found', 'No such order');
  return snap;
}
