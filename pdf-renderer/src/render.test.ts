import { describe, expect, it } from 'vitest';
import { parseInvoiceData, renderInvoicePdf, toDrawable } from './render';
import { INVOICE_LABELS, type InvoiceData } from './types';

const invoice = (over: Partial<InvoiceData> = {}): InvoiceData => ({
  orderId: 'abc',
  createdAt: '2026-10-03T10:00:00.000Z',
  lines: [{ productId: 'mug', name: 'Mug', priceCents: 1400, qty: 2 }],
  subtotalCents: 2800,
  discountCents: 280,
  giftWrapCents: 500,
  giftCardCents: 1000,
  totalCents: 2020,
  labels: Object.fromEntries(INVOICE_LABELS.map((l) => [l, l])) as InvoiceData['labels'],
  names: ['マグカップ'],
  ...over,
});

describe('renderInvoicePdf', () => {
  it('renders a PDF even when the translated text has characters the font cannot draw', async () => {
    const pdf = await renderInvoicePdf(invoice());
    expect(Buffer.from(pdf).subarray(0, 5).toString()).toBe('%PDF-');
  });
  it('renders an invoice with a dozen lines', async () => {
    const lines = Array.from({ length: 12 }, (_, i) => ({ productId: `sku-${i}`, name: `Item ${i}`, priceCents: 100, qty: 1 }));
    const pdf = await renderInvoicePdf(invoice({ lines, names: lines.map((l) => l.name) }));
    expect(Buffer.from(pdf).subarray(0, 5).toString()).toBe('%PDF-');
  });
  it('replaces characters a font cannot draw', () => {
    expect(toDrawable('aé日', new Set([97, 233]))).toBe('aé?');
  });
});

describe('parseInvoiceData', () => {
  it('accepts a well-formed invoice', () => {
    expect(parseInvoiceData(invoice()).orderId).toBe('abc');
  });
  it.each([
    [null],
    [{ ...invoice(), lines: [] }],
    [{ ...invoice(), names: [] }],
    [{ ...invoice(), totalCents: 'x' }],
    [{ ...invoice(), createdAt: 'yesterday' }],
    [{ ...invoice(), labels: {} }],
  ])('rejects %j', (bad) => {
    expect(() => parseInvoiceData(bad)).toThrow();
  });
});
