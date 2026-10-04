import { Timestamp } from 'firebase-admin/firestore';
import { describe, expect, it } from 'vitest';
import { cancelTransition } from './cancelTransition';
import { parseCreateOrder } from './model';
import { orderEventFor } from './orderEvents';

const address = { line1: '1 Demo Street', city: 'Demoville', postalCode: '00000', country: 'ZZ' };
const items = [{ sku: 'sku-mug', qty: 2 }];

describe('parseCreateOrder', () => {
  it('accepts the controller\'s order shape, normalising codes and tags', () => {
    expect(
      parseCreateOrder({
        items,
        couponCode: ' welcome10 ',
        giftCardCode: 'gift-demo-0001',
        giftWrap: true,
        giftNote: '',
        shippingAddress: address,
        tags: ['Birthday', 'birthday', ' gift '],
      }),
    ).toEqual({
      items,
      couponCode: 'WELCOME10',
      giftCardCode: 'GIFT-DEMO-0001',
      giftWrap: true,
      giftNote: '',
      fulfillment: { type: 'delivery', shippingAddress: address },
      tags: ['birthday', 'gift'],
    });
  });
  it('accepts quantity as well as qty, and leaves out what was not sent', () => {
    const parsed = parseCreateOrder({ items: [{ sku: 'sku-mug', quantity: 1 }], pickup: true });
    expect(parsed).toMatchObject({ items: [{ sku: 'sku-mug', qty: 1 }], giftWrap: false, fulfillment: { type: 'pickup' } });
    expect(parsed.couponCode).toBeUndefined();
    expect(parsed.giftNote).toBeUndefined();
  });
  it('needs a shipping address unless the order is a pickup', () => {
    expect(() => parseCreateOrder({ items })).toThrow();
    expect(() => parseCreateOrder({ items, shippingAddress: { ...address, city: '' } })).toThrow();
  });
  it.each([
    [{ pickup: true }],
    [{ pickup: true, items: [] }],
    [{ pickup: true, items: [{ sku: 'sku-mug', qty: 0 }] }],
    [{ pickup: true, items: [{ sku: 'sku-mug', qty: 1.5 }] }],
    [{ pickup: true, items: [{ qty: 1 }] }],
    [{ pickup: true, items: [{ sku: 'a', qty: 1 }, { sku: 'a', qty: 1 }] }],
    [{ pickup: true, items, couponCode: 42 }],
    [{ pickup: true, items, tags: ['bad tag!'] }],
    [{ pickup: true, items, tags: ['a', 'b', 'c', 'd', 'e', 'f'] }],
  ])('rejects %j', (input) => {
    expect(() => parseCreateOrder(input)).toThrow();
  });
});

describe('orderEventFor', () => {
  const at = Timestamp.fromMillis(0);
  it('leaves an event for gift-wrapped orders only, carrying the coupon', () => {
    expect(orderEventFor({ giftWrap: true, couponCode: 'THANKS5' }, 'o1', 'c1', at)).toMatchObject({ type: 'gift-wrapped', couponCode: 'THANKS5' });
    expect(orderEventFor({ giftWrap: false }, 'o1', 'c1', at)).toBeNull();
    expect(orderEventFor({ giftWrap: false, couponCode: 'THANKS5' }, 'o1', 'c1', at)).toBeNull();
  });
});

describe('cancelTransition', () => {
  it('cancels an unpaid order and hands the gift card amount back', () => {
    expect(cancelTransition({ status: 'placed', paymentStatus: 'unpaid', totalCents: 900, giftCardCode: 'G', giftCardCents: 500 })).toEqual({
      kind: 'cancel',
      giftCardCode: 'G',
      refundCents: 500,
    });
  });
  it('treats a second cancel as done and sends a paid order to support', () => {
    expect(cancelTransition({ status: 'cancelled', totalCents: 1 })).toEqual({ kind: 'already-cancelled' });
    expect(cancelTransition({ status: 'placed', paymentStatus: 'paid', totalCents: 900 }).kind).toBe('refuse');
  });
  it('lets a fully gift-card-paid order be cancelled, since nothing was charged to a card', () => {
    expect(cancelTransition({ status: 'placed', paymentStatus: 'paid', totalCents: 0, giftCardCode: 'G', giftCardCents: 900 }).kind).toBe('cancel');
  });
});
