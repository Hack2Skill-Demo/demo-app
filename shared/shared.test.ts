import { describe, expect, it } from 'vitest';
import { yesterdayUtc } from './export';
import { needsTranslation, parseLanguage, splitTranslations, textsToTranslate } from './invoice';
import { CODE_ALPHABET, checkCode, isBlocked, normalizeCode, recordFailure, RATE_LIMIT } from './access';
import { isServerFault } from './health';
import { chargeAmountCents, computeTotals, correctedTotals, CouponError, GIFT_WRAP_CENTS } from './pricing';
import { parseProductCsv } from './csv';
import { summarizeOrders, topCountries, topProducts } from './digest';

describe('pricing', () => {
  const lines = [
    { priceCents: 1999, qty: 2 },
    { priceCents: 500, qty: 1 },
  ];
  it('sums lines in cents', () => {
    expect(computeTotals(lines, null, 0)).toEqual({ subtotalCents: 4498, discountCents: 0, giftWrapCents: 0, giftCardCents: 0, totalCents: 4498 });
  });
  it('applies a percentage coupon, rounded to the cent', () => {
    const t = computeTotals(lines, { percentOff: 30, expiresAtMs: null }, 0);
    expect(t.discountCents).toBe(1349);
    expect(t.totalCents).toBe(3149);
  });
  it('rejects an expired coupon', () => {
    expect(() => computeTotals(lines, { percentOff: 10, expiresAtMs: 5 }, 10)).toThrow(CouponError);
  });
  it('rejects a coupon over 100 percent', () => {
    expect(() => computeTotals(lines, { percentOff: 150, expiresAtMs: null }, 0)).toThrow(CouponError);
  });
});

describe('access codes', () => {
  it('normalizes case, spaces and dashes', () => {
    expect(normalizeCode(' ab3k-9xyz ')).toBe('AB3K9XYZ');
  });
  it('has no look-alike characters in the alphabet', () => {
    expect(CODE_ALPHABET).not.toMatch(/[01OI]/);
  });
  it('checks unknown, revoked, expired and valid codes', () => {
    expect(checkCode(undefined, 0)).toBe('unknown');
    expect(checkCode({ expiresAtMs: 100, revoked: true }, 0)).toBe('revoked');
    expect(checkCode({ expiresAtMs: 100, revoked: false }, 100)).toBe('expired');
    expect(checkCode({ expiresAtMs: 100, revoked: false }, 99)).toBe('ok');
  });
  it('blocks after too many failures and recovers after the window', () => {
    let state = undefined as ReturnType<typeof recordFailure> | undefined;
    for (let i = 0; i < RATE_LIMIT.maxFailures; i++) state = recordFailure(state, 1000);
    expect(isBlocked(state, 2000)).toBe(true);
    expect(isBlocked(state, 1000 + RATE_LIMIT.windowMs)).toBe(false);
    expect(recordFailure(state, 1000 + RATE_LIMIT.windowMs).failures).toBe(1);
  });
});

describe('health', () => {
  it('counts only server faults', () => {
    expect(isServerFault('invalid-argument')).toBe(false);
    expect(isServerFault('internal')).toBe(true);
    expect(isServerFault(undefined)).toBe(true);
  });
});

describe('invoice text', () => {
  const line = { productId: 'a', name: 'Mug', priceCents: 1, qty: 1 };
  it('only parses plain language tags', () => {
    expect(parseLanguage('fr')).toBe('fr');
    expect(parseLanguage('pt-BR')).toBe('pt-BR');
    expect(parseLanguage('../etc')).toBeNull();
    expect(parseLanguage(5)).toBeNull();
  });
  it('skips translation for English only', () => {
    expect(needsTranslation('en')).toBe(false);
    expect(needsTranslation('en-GB')).toBe(false);
    expect(needsTranslation('fil')).toBe(true);
  });
  it('round-trips labels and names', () => {
    const texts = textsToTranslate([line]);
    const { labels, names } = splitTranslations(texts.map((t) => t.toUpperCase()), 1);
    expect(labels.Total).toBe('TOTAL');
    expect(names).toEqual(['MUG']);
    expect(() => splitTranslations(['x'], 1)).toThrow();
  });
});

describe('yesterdayUtc', () => {
  it('covers the whole previous UTC day', () => {
    const r = yesterdayUtc(Date.UTC(2026, 9, 4, 2, 30));
    expect(r.date).toBe('2026-10-03');
    expect(r.endMs - r.startMs).toBe(86_400_000);
    expect(new Date(r.endMs).toISOString()).toBe('2026-10-04T00:00:00.000Z');
  });
});

describe('gift wrap and gift cards', () => {
  const lines = [{ priceCents: 2000, qty: 1 }];
  it('adds the wrap fee and lets a card pay part of the bill', () => {
    const t = computeTotals(lines, null, 0, { giftWrap: true, giftCardBalanceCents: 1000 });
    expect(t).toMatchObject({ giftWrapCents: GIFT_WRAP_CENTS, giftCardCents: 1000, totalCents: 1500 });
  });
  it('never charges a card for more than the bill', () => {
    const t = computeTotals(lines, null, 0, { giftCardBalanceCents: 99_999 });
    expect(t).toMatchObject({ giftCardCents: 2000, totalCents: 0 });
  });
});

describe('correctedTotals', () => {
  const order = { lines: [{ priceCents: 1000, qty: 2 }], discountCents: 0, subtotalCents: 2000, totalCents: 2000 };
  it('returns null for a consistent order', () => {
    expect(correctedTotals(order)).toBeNull();
    expect(chargeAmountCents(order)).toBe(2000);
  });
  it('fixes a drifted total and refuses to bill it', () => {
    const drifted = { ...order, totalCents: 1500 };
    expect(correctedTotals(drifted)).toEqual({ subtotalCents: 2000, discountCents: 0, totalCents: 2000 });
    expect(() => chargeAmountCents(drifted)).toThrow();
  });
  it('recomputes the discount only when the coupon percentage was stored', () => {
    expect(correctedTotals({ ...order, couponPercentOff: 10, discountCents: 0 })).toEqual({
      subtotalCents: 2000,
      discountCents: 200,
      totalCents: 1800,
    });
    expect(correctedTotals({ ...order, discountCents: 300, totalCents: 1700 })).toBeNull();
  });
});

describe('product CSV', () => {
  it('parses quoted fields and prices', () => {
    const { products, errors } = parseProductCsv('id,name,price\r\nmug,"Mug, enamel",14.00\nsticker,Sticker,0.5\n');
    expect(errors).toEqual([]);
    expect(products).toEqual([
      { id: 'mug', name: 'Mug, enamel', priceCents: 1400 },
      { id: 'sticker', name: 'Sticker', priceCents: 50 },
    ]);
  });
  it('rejects the whole file when any row is bad', () => {
    const { errors } = parseProductCsv('id,name,price\nmug,Mug,abc\nMUG,Mug,1\nok,Ok,1\nok,Again,1');
    expect(errors).toHaveLength(3);
  });
  it('names each missing column, and accepts columns in any order', () => {
    expect(parseProductCsv('id,name\nmug,Mug').errors).toEqual(['Missing column "price"']);
    expect(parseProductCsv('price,id,name,note\n1.50,mug,Mug,x').products).toEqual([{ id: 'mug', name: 'Mug', priceCents: 150 }]);
  });
});

describe('sales summaries', () => {
  const o = (status: string, qty: number, subtotalCents: number, discountCents = 0) => ({
    status,
    lines: [{ productId: 'mug', name: 'Mug', qty }],
    subtotalCents,
    discountCents,
  });
  it('leaves cancelled orders out', () => {
    expect(summarizeOrders([o('placed', 2, 2000, 200), o('cancelled', 5, 9999)])).toEqual({
      orderCount: 1,
      units: 2,
      revenueCents: 1800,
      discountCents: 200,
    });
    expect(topProducts([o('placed', 2, 1), o('cancelled', 5, 1)])).toEqual([{ productId: 'mug', name: 'Mug', units: 2 }]);
  });
  it('counts deliveries per country and skips pickups', () => {
    const to = (country?: string) => ({ ...o('placed', 1, 1), ...(country ? { country } : {}) });
    expect(topCountries([to('US'), to('us'), to('DE'), to()])).toEqual([
      { code: 'US', name: 'United States', orders: 2 },
      { code: 'DE', name: 'Germany', orders: 1 },
    ]);
  });
});
