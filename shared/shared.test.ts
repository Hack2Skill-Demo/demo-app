import { describe, expect, it } from 'vitest';
import { CODE_ALPHABET, checkCode, isBlocked, normalizeCode, recordFailure, RATE_LIMIT } from './access';
import { healthColor, isServerFault, pushResult } from './health';
import { computeTotals, CouponError } from './pricing';

describe('pricing', () => {
  const lines = [
    { priceCents: 1999, qty: 2 },
    { priceCents: 500, qty: 1 },
  ];
  it('sums lines in cents', () => {
    expect(computeTotals(lines, null, 0)).toEqual({ subtotalCents: 4498, discountCents: 0, totalCents: 4498 });
  });
  it('applies a percentage coupon, rounded to the cent', () => {
    const t = computeTotals(lines, { percentOff: 15, expiresAtMs: null }, 0);
    expect(t.discountCents).toBe(675);
    expect(t.totalCents).toBe(3823);
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
  it('keeps only the recent window', () => {
    expect(pushResult([true, true], false, 2)).toEqual([true, false]);
  });
  it('colours by success rate', () => {
    expect(healthColor([])).toBe('grey');
    expect(healthColor([true, true, true, true, true, true, true, true, true, true])).toBe('green');
    expect(healthColor([true, true, true, false])).toBe('amber');
    expect(healthColor([true, false, false, false])).toBe('red');
  });
  it('counts only server faults', () => {
    expect(isServerFault('invalid-argument')).toBe(false);
    expect(isServerFault('internal')).toBe(true);
    expect(isServerFault(undefined)).toBe(true);
  });
});
