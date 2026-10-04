import { Timestamp, type DocumentSnapshot } from 'firebase-admin/firestore';

export interface CancellableOrder {
  status?: string;
  paymentStatus?: string;
  totalCents: number;
  giftCardCode?: string | null;
  giftCardCents?: number;
}

export type CancelDecision =
  | { kind: 'already-cancelled' }
  | { kind: 'refuse'; reason: string }
  | { kind: 'cancel'; giftCardCode: string | null; refundCents: number };

/** What cancelling an order does: an unpaid order is cancelled and its gift card amount handed back; a paid one needs support. */
export function cancelTransition(order: CancellableOrder): CancelDecision {
  if (order.status === 'cancelled') return { kind: 'already-cancelled' };
  if (order.paymentStatus === 'paid' && order.totalCents > 0) {
    return { kind: 'refuse', reason: 'This order is paid. Contact support for a refund.' };
  }
  const refundCents = order.giftCardCents ?? 0;
  return { kind: 'cancel', giftCardCode: order.giftCardCode ?? null, refundCents };
}

/** Mark an order cancelled, as long as it has not changed since it was read. */
export async function markCancelled(order: DocumentSnapshot): Promise<void> {
  await order.ref.update({ status: 'cancelled', cancelledAt: Timestamp.now() }, { lastUpdateTime: order.updateTime as Timestamp });
}
