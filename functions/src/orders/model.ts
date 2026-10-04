import { HttpsError } from 'firebase-functions/v2/https';
import type { DocumentSnapshot } from 'firebase-admin/firestore';
import type { Fulfillment, ShippingAddress } from '../../../shared/types';
import { db } from '../lib/firebase';

const MAX_DISTINCT_ITEMS = 20;
const MAX_QTY = 20;
const MAX_TAGS = 5;
const TAG = /^[a-z0-9][a-z0-9-]{0,19}$/;
export const PICKUP_LOCATION = 'Main Street store';

export function parseTag(raw: unknown): string {
  const tag = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  if (!TAG.test(tag)) throw new HttpsError('invalid-argument', 'Tags are 1 to 20 letters, digits or dashes');
  return tag;
}

function parseAddress(raw: unknown): ShippingAddress {
  const a = (raw ?? {}) as Record<string, unknown>;
  const field = (k: string, max: number) => {
    const v = typeof a[k] === 'string' ? (a[k] as string).trim() : '';
    if (!v || v.length > max) throw new HttpsError('invalid-argument', 'Enter a delivery address');
    return v;
  };
  return { line1: field('line1', 120), city: field('city', 80), postalCode: field('postalCode', 20), country: field('country', 2) };
}

export interface ParsedOrder {
  items: { sku: string; qty: number }[];
  couponCode?: string;
  giftCardCode?: string;
  giftWrap: boolean;
  giftNote?: string;
  fulfillment: Fulfillment;
  tags: string[];
}

export function parseCreateOrder(data: unknown): ParsedOrder {
  const body = (data ?? {}) as Record<string, unknown>;
  if (!Array.isArray(body.items) || body.items.length === 0 || body.items.length > MAX_DISTINCT_ITEMS) {
    throw new HttpsError('invalid-argument', 'Add between 1 and 20 items to the cart');
  }
  const seen = new Set<string>();
  const items = (body.items as Record<string, unknown>[]).map((item) => {
    const qty = item?.qty ?? item?.quantity;
    if (typeof item?.sku !== 'string' || !item.sku || item.sku.includes('/')) throw new HttpsError('invalid-argument', 'Each item needs a sku');
    if (typeof qty !== 'number' || !Number.isInteger(qty) || qty < 1 || qty > MAX_QTY) {
      throw new HttpsError('invalid-argument', `Each quantity must be a whole number from 1 to ${MAX_QTY}`);
    }
    if (seen.has(item.sku)) throw new HttpsError('invalid-argument', 'Each product may appear once');
    seen.add(item.sku);
    return { sku: item.sku, qty };
  });
  for (const k of ['couponCode', 'giftCardCode'] as const) {
    if (body[k] !== undefined && (typeof body[k] !== 'string' || (body[k] as string).length > 40)) {
      throw new HttpsError('invalid-argument', k === 'couponCode' ? 'Coupon is not valid' : 'Gift card is not valid');
    }
  }
  if (body.giftNote !== undefined && (typeof body.giftNote !== 'string' || body.giftNote.length > 300)) {
    throw new HttpsError('invalid-argument', 'The gift note is at most 300 characters');
  }
  if (body.tags !== undefined && (!Array.isArray(body.tags) || body.tags.length > MAX_TAGS)) {
    throw new HttpsError('invalid-argument', `At most ${MAX_TAGS} tags`);
  }
  const code = (v: unknown) => (typeof v === 'string' ? v.trim().toUpperCase() || undefined : undefined);
  return {
    items,
    couponCode: code(body.couponCode),
    giftCardCode: code(body.giftCardCode),
    giftWrap: body.giftWrap === true,
    giftNote: typeof body.giftNote === 'string' ? body.giftNote : undefined,
    fulfillment: body.pickup === true ? { type: 'pickup', location: PICKUP_LOCATION } : { type: 'delivery', shippingAddress: parseAddress(body.shippingAddress) },
    tags: [...new Set(((body.tags ?? []) as unknown[]).map(parseTag))],
  };
}

/** Load an order the caller owns. Someone else's order looks the same as a missing one. */
export async function loadOwnOrder(orderId: unknown, uid: string): Promise<DocumentSnapshot> {
  if (typeof orderId !== 'string' || !orderId || orderId.includes('/')) throw new HttpsError('invalid-argument', 'orderId is required');
  const snap = await db.doc(`orders/${orderId}`).get();
  if (!snap.exists || snap.get('customerId') !== uid) throw new HttpsError('not-found', 'No such order');
  return snap;
}
