import { logger } from 'firebase-functions/v2';
import { defineSecret } from 'firebase-functions/params';
import { onRequest } from 'firebase-functions/v2/https';
import { Timestamp } from 'firebase-admin/firestore';
import { db } from '../lib/firebase';
import { verifySignature } from '../lib/signature';
import { trackOutcome } from '../lib/track';

/** Shared with the payment provider. Set with: firebase functions:secrets:set PAYMENT_WEBHOOK_SECRET */
const webhookSecret = defineSecret('PAYMENT_WEBHOOK_SECRET');

/** The payment provider's callback. Nothing is believed until its signature checks out. */
export const webhook = onRequest({ secrets: [webhookSecret] }, async (req, res) => {
    if (req.method !== 'POST') return void res.status(405).send('POST only');
    let signed: boolean;
    try {
      signed = await trackOutcome('payments-webhook', async () => verifySignature(req.rawBody, req.header('x-signature'), webhookSecret.value()));
    } catch {
      return void res.status(500).send('Try again');
    }
    if (!signed) {
      logger.warn('payment webhook with a bad signature');
      return void res.status(401).send('Bad signature');
    }
    const { type, orderId } = (req.body ?? {}) as { type?: unknown; orderId?: unknown };
    if (typeof orderId !== 'string' || !orderId || orderId.includes('/')) return void res.status(400).send('orderId is required');
    const status = type === 'payment.succeeded' ? 'paid' : type === 'payment.failed' ? 'failed' : null;
    if (!status) return void res.status(200).send('Ignored');

    try {
      const found = await trackOutcome('payments-webhook', async () => {
        const ref = db.doc(`orders/${orderId}`);
        if (!(await ref.get()).exists) return false;
        await ref.update({ 'payment.status': status, 'payment.updatedAt': Timestamp.now() });
        return true;
      });
      res.status(found ? 200 : 404).send(found ? 'OK' : 'No such order');
    } catch {
      // The provider retries on a 5xx.
      res.status(500).send('Try again');
    }
  });