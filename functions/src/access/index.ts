import { createHash, randomInt } from 'node:crypto';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { Timestamp } from 'firebase-admin/firestore';
import {
  CODE_ALPHABET,
  CODE_LENGTH,
  checkCode,
  isBlocked,
  normalizeCode,
  recordFailure,
  type CodeCheck,
  type RateState,
} from '../../../shared/access';
import { db } from '../lib/firebase';
import { requireAuth, requireTeam } from '../lib/guards';
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

export const access = {
  /** A visitor trades a code for a grant on their (anonymous) account. */
  redeemCode: onCall(
    tracked<{ code?: unknown }, { expiresAtMs: number }>('access', async (req) => {
      const uid = requireAuth(req);
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
        tx.set(accessGrant(uid), {
          codeHash: hash,
          grantedAt: Timestamp.fromMillis(now),
          expiresAt: Timestamp.fromMillis(record.expiresAtMs),
        });
        tx.delete(rateRef);
        return { kind: 'granted' as const, expiresAtMs: record.expiresAtMs };
      });

      if (outcome.kind === 'blocked') {
        throw new HttpsError('resource-exhausted', 'Too many wrong codes. Try again in a few minutes.');
      }
      if (outcome.kind === 'rejected') throw new HttpsError('permission-denied', MESSAGES[outcome.check]);
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
    const expiresAtMs = Date.now() + days * 24 * 60 * 60 * 1000;
    await db.doc(`accessCodes/${hashCode(code)}`).set({
      createdBy: uid,
      createdAt: Timestamp.now(),
      expiresAt: Timestamp.fromMillis(expiresAtMs),
      revoked: false,
    });
    return { code, expiresAtMs };
  }),

  /** Revoking a code also ends the grants it opened. */
  revokeCode: onCall(async (req) => {
    requireTeam(req);
    if (typeof req.data?.code !== 'string') throw new HttpsError('invalid-argument', 'code is required');
    const hash = hashCode(normalizeCode(req.data.code));
    const ref = db.doc(`accessCodes/${hash}`);
    if (!(await ref.get()).exists) throw new HttpsError('not-found', 'No such code');
    await ref.update({ revoked: true });
    const grants = await db.collection('accessGrants').where('codeHash', '==', hash).get();
    await Promise.all(grants.docs.map((g) => g.ref.delete()));
    return { revokedGrants: grants.size };
  }),
};

function accessGrant(uid: string) {
  return db.doc(`accessGrants/${uid}`);
}
