import { describe, expect, it } from 'vitest';
import { renderInvoicePdf } from './index';

describe('renderInvoicePdf', () => {
  it('renders a PDF even when the translated text has characters the font cannot draw', async () => {
    const labels = Object.fromEntries(
      ['Invoice', 'Order', 'Date', 'Item', 'Qty', 'Price', 'Subtotal', 'Discount', 'Total'].map((l) => [l, l]),
    ) as never;
    const pdf = await renderInvoicePdf({
      orderId: 'abc',
      createdAt: new Date('2026-10-03T10:00:00Z'),
      lines: [{ productId: 'mug', name: 'Mug', priceCents: 1400, qty: 2 }],
      subtotalCents: 2800,
      discountCents: 280,
      totalCents: 2520,
      labels,
      names: ['マグカップ'],
    });
    expect(Buffer.from(pdf).subarray(0, 5).toString()).toBe('%PDF-');
  });
});
