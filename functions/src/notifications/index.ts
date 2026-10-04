import { defineSecret, defineString } from 'firebase-functions/params';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import type { OrderLine } from '../../../shared/types';
import { db } from '../lib/firebase';
import { requireGrant } from '../lib/guards';
import { fetchJson } from '../lib/http';
import { tracked } from '../lib/track';
import { loadOwnOrder } from '../orders/model';

/** Base URL of the mail provider, set per deployment in functions/.env.<project>. */
const mailUrl = defineString('MAIL_PROVIDER_URL', { default: '' });
/** The provider's API key. Set with: firebase functions:secrets:set MAIL_PROVIDER_KEY */
const mailKey = defineSecret('MAIL_PROVIDER_KEY');

const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,255}$/;
const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;

export function receiptText(orderId: string, lines: OrderLine[], totalCents: number): string {
  return [
    `Thank you for your order ${orderId}.`,
    '',
    ...lines.map((l) => `${l.qty} x ${l.name}  ${money(l.priceCents * l.qty)}`),
    '',
    `Total paid by card: ${money(totalCents)}`,
  ].join('\n');
}

export const notifications = {
  /** Email a receipt to the address on the customer's profile, or to one they type in. */
  sendReceiptEmail: onCall(
    { secrets: [mailKey] },
    tracked<{ orderId?: unknown; email?: unknown }, { sentTo: string }>('receipts', async (req) => {
      const uid = await requireGrant(req);
      const order = await loadOwnOrder(req.data?.orderId, uid);

      let to = typeof req.data?.email === 'string' ? req.data.email.trim() : '';
      if (!to) to = String((await db.doc(`profiles/${uid}`).get()).get('email') ?? '');
      if (!EMAIL.test(to)) throw new HttpsError('invalid-argument', 'Enter an email address for the receipt');

      const base = mailUrl.value().replace(/\/+$/, '');
      if (!base) throw new HttpsError('failed-precondition', 'Email is not configured');
      await fetchJson(`${base}/send`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${mailKey.value()}` },
        body: JSON.stringify({
          to,
          subject: `Your receipt for order ${order.id}`,
          text: receiptText(order.id, order.get('lines') as OrderLine[], order.get('totalCents') as number),
        }),
        timeoutMs: 10_000,
      });
      return { sentTo: to };
    }),
  ),
};
