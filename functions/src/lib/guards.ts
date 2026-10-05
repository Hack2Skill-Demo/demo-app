import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import { db } from './firebase';

export function requireAuth(req: CallableRequest): string {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Sign in first');
  return req.auth.uid;
}

export function isTeam(req: CallableRequest): boolean {
  return req.auth?.token.demoTeam === true;
}

export function requireTeam(req: CallableRequest): string {
  const uid = requireAuth(req);
  if (!isTeam(req)) throw new HttpsError('permission-denied', 'Team members only');
  return uid;
}

/** A visitor is let in by a valid access code, which leaves a grant that lasts until the code's expiry. */
export async function requireGrant(req: CallableRequest): Promise<string> {
  const uid = requireAuth(req);
  if (isTeam(req)) return uid;
  const grant = await db.doc(`accessGrants/${uid}`).get();
  const expiresAt = grant.get('expiresAt') as { toMillis(): number } | undefined;
  if (!expiresAt || expiresAt.toMillis() <= Date.now()) {
    throw new HttpsError('permission-denied', 'Enter an access code first');
  }
  return uid;
}

/** Only a visitor (an anonymous account) may redeem an access code. Real accounts in this shared project, such as another app's operators, never do. */
export function isAnonymous(req: CallableRequest): boolean {
  return req.auth?.token.firebase?.sign_in_provider === 'anonymous';
}

/** Add a claim to what the account already carries. `setCustomUserClaims` replaces the whole set, which would wipe any other claim on the account. */
export function mergeClaims(existing: Record<string, unknown> | undefined, add: Record<string, unknown>): Record<string, unknown> {
  return { ...(existing ?? {}), ...add };
}
