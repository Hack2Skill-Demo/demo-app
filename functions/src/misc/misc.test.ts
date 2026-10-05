import { describe, expect, it } from 'vitest';
import { sellable } from './index';

describe('sellable', () => {
  it('leaves out a product with no price, so the cache document never holds an undefined field', () => {
    const out = sellable([
      { id: 'sku-mug', name: 'Mug', priceCents: 1400 },
      { id: 'sku-sample-free', name: 'Free sample', priceCents: undefined },
      { id: 'sku-odd', name: 'Odd', priceCents: 12.5 },
      { id: 'sku-noname', priceCents: 100 },
    ]);
    expect(out).toEqual([{ id: 'sku-mug', name: 'Mug', priceCents: 1400 }]);
    expect(JSON.stringify(out)).not.toContain('undefined');
  });
});
