import { describe, expect, it } from 'vitest';
import { parseCreateOrder } from './model';

describe('parseCreateOrder', () => {
  it('accepts a cart, normalising coupon, gift card and tags and defaulting to pickup', () => {
    expect(
      parseCreateOrder({
        items: [{ productId: 'mug', qty: 2 }],
        coupon: ' welcome10 ',
        giftCardCode: 'gc-1',
        giftWrap: true,
        tags: ['Birthday', 'birthday', ' gift '],
      }),
    ).toEqual({
      items: [{ productId: 'mug', qty: 2 }],
      coupon: 'WELCOME10',
      giftCardCode: 'GC-1',
      giftWrap: true,
      fulfillment: { type: 'pickup', location: 'Main Street store' },
      tags: ['birthday', 'gift'],
    });
  });
  it('needs an address for delivery', () => {
    const items = [{ productId: 'mug', qty: 1 }];
    expect(parseCreateOrder({ items, fulfillment: { type: 'delivery', address: '12 Harbour Rd' } }).fulfillment).toEqual({
      type: 'delivery',
      address: '12 Harbour Rd',
    });
    expect(() => parseCreateOrder({ items, fulfillment: { type: 'delivery', address: '' } })).toThrow();
    expect(() => parseCreateOrder({ items, fulfillment: { type: 'drone' } })).toThrow();
  });
  it.each([
    [{}],
    [{ items: [] }],
    [{ items: [{ productId: 'mug', qty: 0 }] }],
    [{ items: [{ productId: 'mug', qty: 1.5 }] }],
    [{ items: [{ productId: 'mug', qty: 1 }, { productId: 'mug', qty: 1 }] }],
    [{ items: [{ productId: 'mug', qty: 1 }], coupon: 42 }],
    [{ items: [{ productId: 'mug', qty: 1 }], tags: ['bad tag!'] }],
    [{ items: [{ productId: 'mug', qty: 1 }], tags: ['a', 'b', 'c', 'd', 'e', 'f'] }],
  ])('rejects %j', (input) => {
    expect(() => parseCreateOrder(input)).toThrow();
  });
});
