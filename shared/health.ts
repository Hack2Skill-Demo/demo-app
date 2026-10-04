/** Health of a feature, from the share of its recent calls that succeeded. */
export type HealthColor = 'green' | 'amber' | 'red' | 'grey';

export const HEALTH_WINDOW = 20;

export function pushResult(recent: readonly boolean[], ok: boolean, window = HEALTH_WINDOW): boolean[] {
  return [...recent, ok].slice(-window);
}

export function healthColor(recent: readonly boolean[]): HealthColor {
  if (recent.length === 0) return 'grey';
  const rate = recent.filter(Boolean).length / recent.length;
  if (rate >= 0.9) return 'green';
  if (rate >= 0.6) return 'amber';
  return 'red';
}

const CLIENT_FAULT_CODES = new Set([
  'invalid-argument',
  'unauthenticated',
  'permission-denied',
  'not-found',
  'already-exists',
  'resource-exhausted',
  'failed-precondition',
  'cancelled',
]);

/**
 * Whether a failed call counts against a feature's health. A visitor typing a wrong
 * access code or an expired coupon is not the shop failing; everything else is.
 */
export function isServerFault(code: string | undefined): boolean {
  return code === undefined || !CLIENT_FAULT_CODES.has(code);
}
