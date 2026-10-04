/** Pure rules for access codes, kept apart from Firestore so they can be tested. */
export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const CODE_LENGTH = 10;

export const RATE_LIMIT = { maxFailures: 5, windowMs: 10 * 60 * 1000 };

export function normalizeCode(raw: string): string {
  return raw.replace(/[\s-]/g, '').toUpperCase();
}

export interface CodeRecord {
  expiresAtMs: number;
  revoked: boolean;
}

export type CodeCheck = 'ok' | 'unknown' | 'revoked' | 'expired';

export function checkCode(record: CodeRecord | undefined, nowMs: number): CodeCheck {
  if (!record) return 'unknown';
  if (record.revoked) return 'revoked';
  if (record.expiresAtMs <= nowMs) return 'expired';
  return 'ok';
}

export interface RateState {
  failures: number;
  windowStartMs: number;
}

export function isBlocked(state: RateState | undefined, nowMs: number, limit = RATE_LIMIT): boolean {
  if (!state || nowMs - state.windowStartMs >= limit.windowMs) return false;
  return state.failures >= limit.maxFailures;
}

export function recordFailure(state: RateState | undefined, nowMs: number, limit = RATE_LIMIT): RateState {
  if (!state || nowMs - state.windowStartMs >= limit.windowMs) return { failures: 1, windowStartMs: nowMs };
  return { failures: state.failures + 1, windowStartMs: state.windowStartMs };
}
