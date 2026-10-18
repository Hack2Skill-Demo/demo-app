import { createHash, randomBytes, randomInt } from 'node:crypto';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { getAuth } from 'firebase-admin/auth';
import { Timestamp } from 'firebase-admin/firestore';
import {
  CODE_ALPHABET,
  CODE_LENGTH,
  OPEN_CODE_ID,
  OPEN_GRANT_DAYS,
  checkCode,
  isBlocked,
  normalizeCode,
  recordFailure,
  type CodeCheck,
  type RateState,
} from '../../../shared/access';
import { db } from '../lib/firebase';
import { isAnonymous, mergeClaims, requireAuth, requireTeam } from '../lib/guards';
import { tracked } from '../lib/track';

/** Codes are high-entropy and random, so a plain SHA-256 is enough; only the hash is ever stored. */
export const hashCode = (normalized: string): string => createHash('sha256').update(normalized).digest('hex');

const MAX_TTL_DAYS = 90;

function generateCode(): string {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return code;
}

const MESSAGES: Record<Exclude<CodeCheck, 'ok'>, string> = {
  unknown: 'That code is not valid',
  revoked: 'That code has been revoked',
  expired: 'That code has expired',
};

/**
 * Claims the demo controller (`control-*`) checks, in the same project:
 * a code holder carries `demoAccessCodeId`, the code's id and never the code; a team member carries
 * `demoTeam: true`. Set `demoTeam` by hand with the Admin SDK (`setCustomUserClaims`).
 */
export const access = {
  /**
   * No code needed: any visitor (an anonymous account) is given an open grant and the claim the controller checks.
   * Safe to call again; it only extends the grant. Refresh the ID token afterwards.
   */
  enter: onCall(
    tracked<undefined, { expiresAtMs: number }>('access-enter', async (req) => {
      const uid = requireAuth(req);
      if (!isAnonymous(req)) {
        throw new HttpsError('failed-precondition', 'Only visitors are let in without a code. Team members sign in with their own account.');
      }
      const now = Date.now();
      const expiresAtMs = now + OPEN_GRANT_DAYS * 24 * 60 * 60 * 1000;
      await db.doc(`accessGrants/${uid}`).set({
        codeId: OPEN_CODE_ID,
        grantedAt: Timestamp.fromMillis(now),
        expiresAt: Timestamp.fromMillis(expiresAtMs),
      });
      const user = await getAuth().getUser(uid);
      if (user.customClaims?.demoAccessCodeId !== OPEN_CODE_ID) {
        await getAuth().setCustomUserClaims(uid, mergeClaims(user.customClaims, { demoAccessCodeId: OPEN_CODE_ID }));
      }
      return { expiresAtMs };
    }),
  ),

  /** A visitor trades a code for a grant and a claim on their (anonymous) account. Refresh the ID token afterwards. */
  redeemCode: onCall(
    tracked<{ code?: unknown }, { expiresAtMs: number }>('access-redeemCode', async (req) => {
      const uid = requireAuth(req);
      if (!isAnonymous(req)) {
        throw new HttpsError('failed-precondition', 'Access codes are for visitors. Team members sign in with their own account.');
      }
      if (typeof req.data?.code !== 'string' || req.data.code.length > 64) {
        throw new HttpsError('invalid-argument', 'Enter your access code');
      }
      const hash = hashCode(normalizeCode(req.data.code));
      const rateRef = db.doc(`rateLimits/${uid}`);
      const codeRef = db.doc(`accessCodes/${hash}`);

      const outcome = await db.runTransaction(async (tx) => {
        const [rateSnap, codeSnap] = await Promise.all([tx.get(rateRef), tx.get(codeRef)]);
        const now = Date.now();
        const rate = rateSnap.exists ? (rateSnap.data() as RateState) : undefined;
        if (isBlocked(rate, now)) return { kind: 'blocked' as const };

        const record = codeSnap.exists
          ? { expiresAtMs: (codeSnap.get('expiresAt') as Timestamp).toMillis(), revoked: codeSnap.get('revoked') === true }
          : undefined;
        const check = checkCode(record, now);
        if (check !== 'ok' || !record) {
          tx.set(rateRef, recordFailure(rate, now));
          return { kind: 'rejected' as const, check: check === 'ok' ? ('unknown' as const) : check };
        }
        const codeId = String(codeSnap.get('codeId'));
        tx.set(db.doc(`accessGrants/${uid}`), {
          codeId,
          grantedAt: Timestamp.fromMillis(now),
          expiresAt: Timestamp.fromMillis(record.expiresAtMs),
        });
        tx.delete(rateRef);
        return { kind: 'granted' as const, expiresAtMs: record.expiresAtMs, codeId };
      });

      if (outcome.kind === 'blocked') {
        throw new HttpsError('resource-exhausted', 'Too many wrong codes. Try again in a few minutes.');
      }
      if (outcome.kind === 'rejected') throw new HttpsError('permission-denied', MESSAGES[outcome.check]);
      const user = await getAuth().getUser(uid);
      await getAuth().setCustomUserClaims(uid, mergeClaims(user.customClaims, { demoAccessCodeId: outcome.codeId }));
      return { expiresAtMs: outcome.expiresAtMs };
    }),
  ),

  /** Team members mint a code. The plaintext is returned once and never stored. */
  createCode: onCall(async (req) => {
    const uid = requireTeam(req);
    const days = Number(req.data?.days ?? 7);
    if (!Number.isInteger(days) || days < 1 || days > MAX_TTL_DAYS) {
      throw new HttpsError('invalid-argument', `days must be a whole number from 1 to ${MAX_TTL_DAYS}`);
    }
    const code = generateCode();
    const codeId = randomBytes(9).toString('base64url');
    const expiresAtMs = Date.now() + days * 24 * 60 * 60 * 1000;
    await db.doc(`accessCodes/${hashCode(code)}`).set({
      codeId,
      createdBy: uid,
      createdAt: Timestamp.now(),
      expiresAt: Timestamp.fromMillis(expiresAtMs),
      revoked: false,
    });
    return { code, codeId, expiresAtMs };
  }),

  /** Revoking a code ends its grants and revokes the refresh tokens of every account it opened, so `control-*` refuses them too. */
  revokeCode: onCall(async (req) => {
    requireTeam(req);
    if (typeof req.data?.code !== 'string') throw new HttpsError('invalid-argument', 'code is required');
    const ref = db.doc(`accessCodes/${hashCode(normalizeCode(req.data.code))}`);
    const snap = await ref.get();
    if (!snap.exists) throw new HttpsError('not-found', 'No such code');
    await ref.update({ revoked: true });
    const grants = await db.collection('accessGrants').where('codeId', '==', snap.get('codeId')).get();
    await Promise.all(
      grants.docs.map(async (g) => {
        await getAuth().revokeRefreshTokens(g.id);
        await g.ref.delete();
      }),
    );
    return { revokedGrants: grants.size };
  }),
};
