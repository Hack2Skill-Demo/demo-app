import { describe, expect, it } from 'vitest';
import { parseCreateOrder } from './index';

describe('parseCreateOrder', () => {
  it('accepts a cart and upper-cases the coupon', () => {
    expect(parseCreateOrder({ items: [{ productId: 'mug', qty: 2 }], coupon: ' welcome10 ' })).toEqual({
      items: [{ productId: 'mug', qty: 2 }],
      coupon: 'WELCOME10',
    });
  });
  it.each([
    [{}],
    [{ items: [] }],
    [{ items: [{ productId: 'mug', qty: 0 }] }],
    [{ items: [{ productId: 'mug', qty: 1.5 }] }],
    [{ items: [{ productId: 'mug', qty: 1 }, { productId: 'mug', qty: 1 }] }],
    [{ items: [{ productId: 'mug', qty: 1 }], coupon: 42 }],
  ])('rejects %j', (input) => {
    expect(() => parseCreateOrder(input)).toThrow();
  });
});
