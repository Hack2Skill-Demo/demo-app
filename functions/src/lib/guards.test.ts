import type { CallableRequest } from 'firebase-functions/v2/https';
import { describe, expect, it } from 'vitest';
import { isAnonymous, mergeClaims } from './guards';

const asReq = (provider?: string) => ({ auth: { uid: 'u', token: { firebase: { sign_in_provider: provider } } } }) as unknown as CallableRequest;

describe('isAnonymous', () => {
  it('is true only for an anonymous account', () => {
    expect(isAnonymous(asReq('anonymous'))).toBe(true);
    expect(isAnonymous(asReq('password'))).toBe(false);
    expect(isAnonymous({} as CallableRequest)).toBe(false);
  });
});

describe('mergeClaims', () => {
  it('keeps the claims the account already has', () => {
    expect(mergeClaims({ role: 'admin' }, { demoAccessCodeId: 'c1' })).toEqual({ role: 'admin', demoAccessCodeId: 'c1' });
    expect(mergeClaims(undefined, { demoAccessCodeId: 'c1' })).toEqual({ demoAccessCodeId: 'c1' });
  });
});
