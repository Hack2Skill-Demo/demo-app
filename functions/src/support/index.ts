import { logger } from 'firebase-functions/v2';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { Timestamp } from 'firebase-admin/firestore';
import { db } from '../lib/firebase';
import { requireGrant } from '../lib/guards';
import { tracked } from '../lib/track';

const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,255}$/;

export function parseTicket(data: unknown): { email: string; subject: string; message: string } {
  const d = (data ?? {}) as Record<string, unknown>;
  const email = typeof d.email === 'string' ? d.email.trim() : '';
  const subject = typeof d.subject === 'string' ? d.subject.trim() : '';
  const message = typeof d.message === 'string' ? d.message.trim() : '';
  if (!EMAIL.test(email)) throw new HttpsError('invalid-argument', 'Enter a valid email address');
  if (!subject || subject.length > 120) throw new HttpsError('invalid-argument', 'The subject must be 1 to 120 characters');
  if (!message || message.length > 2000) throw new HttpsError('invalid-argument', 'The message must be 1 to 2000 characters');
  return { email, subject, message };
}

export const support = {
  submitTicket: onCall(
    tracked<unknown, { ticketId: string }>('support', async (req) => {
      const uid = await requireGrant(req);
      let ticket;
      try {
        ticket = parseTicket(req.data);
      } catch (err) {
        logger.error(`Ticket rejected: ${err instanceof Error ? err.message : String(err)}. Ticket: ${JSON.stringify(req.data)}`);
        throw err;
      }
      const ref = db.collection('tickets').doc();
      await ref.set({ ...ticket, uid, status: 'open', createdAt: Timestamp.now() });
      return { ticketId: ref.id };
    }),
  ),
};
