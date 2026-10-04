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
 * Whether a failed call is the shop's fault. A visitor typing a wrong access code or an expired coupon is
 * not, so it is not logged as an error; everything else is, and the error log is what Starfish reads.
 */
export function isServerFault(code: string | undefined): boolean {
  return code === undefined || !CLIENT_FAULT_CODES.has(code);
}
