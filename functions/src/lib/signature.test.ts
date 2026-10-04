import { describe, expect, it } from 'vitest';
import { sign, verifySignature } from './signature';

describe('verifySignature', () => {
  const body = '{"type":"payment.succeeded","orderId":"o1"}';
  it('accepts the right signature', () => {
    expect(verifySignature(body, sign(body, 's3cret'), 's3cret')).toBe(true);
  });
  it('rejects a wrong secret, a changed body, a missing header and a header of the wrong length', () => {
    expect(verifySignature(body, sign(body, 'other'), 's3cret')).toBe(false);
    expect(verifySignature(body + ' ', sign(body, 's3cret'), 's3cret')).toBe(false);
    expect(verifySignature(body, undefined, 's3cret')).toBe(false);
    expect(verifySignature(body, 'sha256=abc', 's3cret')).toBe(false);
  });
  it('never accepts anything when the secret is empty', () => {
    expect(verifySignature(body, sign(body, ''), '')).toBe(false);
  });
});
