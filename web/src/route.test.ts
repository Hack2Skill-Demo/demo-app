import { describe, expect, it } from 'vitest';
import { pageFromHash } from './route';

describe('pageFromHash', () => {
  it('opens the page a fragment names', () => {
    expect(pageFromHash('#lab')).toBe('lab');
    expect(pageFromHash('#LAB')).toBe('lab');
    expect(pageFromHash('#orders')).toBe('orders');
  });

  it('opens the shop for no fragment or an unknown one', () => {
    expect(pageFromHash('')).toBe('shop');
    expect(pageFromHash('#')).toBe('shop');
    expect(pageFromHash('#admin')).toBe('shop');
  });
});
