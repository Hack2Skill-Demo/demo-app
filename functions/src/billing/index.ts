import { defineString } from 'firebase-functions/params';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { chargeAmountCents, type StoredOrderPricing } from '../../../shared/pricing';
import { requireGrant } from '../lib/guards';
import { fetchJson } from '../lib/http';
import { tracked } from '../lib/track';
import { loadOwnOrder } from '../orders/model';

/** Base URL of the payment provider, set per deployment in functions/.env.<project>. */
const providerUrl = defineString('PAYMENT_PROVIDER_URL', { default: '' });

export const billing = {
  /** Start a card payment for an unpaid order. The amount is priced from the order's lines, never taken from the client. */
  createCheckoutSession: onCall(
    tracked<{ orderId?: unknown }, { checkoutUrl: string }>('billing', async (req) => {
      const uid = await requireGrant(req);
      const snap = await loadOwnOrder(req.data?.orderId, uid);
      if (snap.get('status') === 'cancelled') throw new HttpsError('failed-precondition', 'This order was cancelled');
      if (snap.get('payment.status') === 'paid') throw new HttpsError('failed-precondition', 'This order is already paid');

      const amountCents = chargeAmountCents(snap.data() as StoredOrderPricing);
      if (amountCents <= 0) throw new HttpsError('failed-precondition', 'Nothing to pay on this order');

      const base = providerUrl.value().replace(/\/+$/, '');
      if (!base) throw new HttpsError('failed-precondition', 'Card payment is not configured');
      const origin = req.rawRequest.headers.origin;
      const returnUrl = typeof origin === 'string' ? origin : undefined;

      const session = await fetchJson<{ id: string; url: string }>(`${base}/sessions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ orderId: snap.id, amountCents, currency: 'usd', returnUrl }),
        timeoutMs: 10_000,
      });
      await snap.ref.update({ 'payment.status': 'pending', 'payment.sessionId': session.id });
      return { checkoutUrl: session.url };
    }),
  ),
};
