import { useCallback, useEffect, useState, type FormEvent } from 'react';
import type { OrderSummary } from '../../../shared/types';
import { call, errorMessage } from '../firebase';
import { money } from '../format';

function InvoiceButton({ orderId }: { orderId: string }) {
  const [state, setState] = useState<'idle' | 'busy' | 'failed'>('idle');

  const download = async () => {
    setState('busy');
    try {
      const { pdfBase64, filename } = await call<{ orderId: string; language: string }, { pdfBase64: string; filename: string }>(
        'invoices-renderPdf',
        { orderId, language: navigator.language || 'en' },
      );
      const bytes = Uint8Array.from(atob(pdfBase64), (c) => c.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      setState('idle');
    } catch {
      setState('failed');
    }
  };

  return (
    <span>
      <button disabled={state === 'busy'} onClick={() => void download()}>
        {state === 'busy' ? 'Preparing…' : 'Download invoice'}
      </button>
      {state === 'failed' && <span role="alert" className="error"> Invoice unavailable. Try again later.</span>}
    </span>
  );
}

/** Runs one action on an order and shows its outcome, good or bad, next to the button. */
function ActionButton({ label, busyLabel, run }: { label: string; busyLabel: string; run: () => Promise<string> }) {
  const [state, setState] = useState<{ kind: 'idle' | 'busy' } | { kind: 'done' | 'failed'; text: string }>({ kind: 'idle' });
  const press = async () => {
    setState({ kind: 'busy' });
    try {
      setState({ kind: 'done', text: await run() });
    } catch (err) {
      setState({ kind: 'failed', text: errorMessage(err) });
    }
  };
  return (
    <span>
      <button disabled={state.kind === 'busy'} onClick={() => void press()}>{state.kind === 'busy' ? busyLabel : label}</button>
      {state.kind === 'done' && <span role="status"> {state.text}</span>}
      {state.kind === 'failed' && <span role="alert" className="error"> {state.text}</span>}
    </span>
  );
}

function OrderDetails({ orderId, onChanged }: { orderId: string; onChanged: () => void }) {
  const [order, setOrder] = useState<OrderSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    call<{ orderId: string }, { order: OrderSummary }>('orders-getOrder', { orderId })
      .then((res) => setOrder(res.order))
      .catch((err) => setError(errorMessage(err)));
  }, [orderId]);
  useEffect(load, [load]);

  if (error) return <p role="alert" className="error">Could not load the order: {error} <button onClick={load}>Try again</button></p>;
  if (!order) return <p>Loading details…</p>;

  const cancelled = order.status === 'cancelled';
  return (
    <div className="details">
      <p>
        {order.fulfillment.type === 'delivery'
          ? `Delivery to ${order.fulfillment.shippingAddress.line1}, ${order.fulfillment.shippingAddress.city}`
          : `Pickup at ${order.fulfillment.location}`}
        {order.giftWrap && ' · gift wrapped'}
        {order.giftNote && ` · note: “${order.giftNote}”`}
        {order.tags.length > 0 && ` · tags: ${order.tags.join(', ')}`}
      </p>
      <p>
        Subtotal {money(order.subtotalCents)}
        {order.discountCents > 0 && ` · discount −${money(order.discountCents)}`}
        {order.giftWrapCents > 0 && ` · gift wrap ${money(order.giftWrapCents)}`}
        {order.giftCardCents > 0 && ` · gift card −${money(order.giftCardCents)}`}
        {' · to pay by card '}{money(order.totalCents)} ({cancelled ? 'cancelled' : order.paymentStatus})
      </p>
      <InvoiceButton orderId={order.id} />{' '}
      {!cancelled && order.paymentStatus !== 'paid' && order.totalCents > 0 && (
        <ActionButton
          label="Pay by card"
          busyLabel="Opening checkout…"
          run={async () => {
            const { checkoutUrl } = await call<{ orderId: string }, { checkoutUrl: string }>('billing-createCheckoutSession', { orderId });
            window.location.assign(checkoutUrl);
            return 'Redirecting to the payment page…';
          }}
        />
      )}{' '}
      {order.paymentStatus === 'paid' && (
        <ActionButton
          label="Email receipt"
          busyLabel="Sending…"
          run={async () => {
            const email = window.prompt('Send the receipt to which email address?') ?? '';
            const { sentTo } = await call<{ orderId: string; email: string }, { sentTo: string }>('notifications-sendReceiptEmail', { orderId, email });
            return `Receipt sent to ${sentTo}`;
          }}
        />
      )}{' '}
      {!cancelled && (
        <ActionButton
          label="Cancel order"
          busyLabel="Cancelling…"
          run={async () => {
            await call('orders-cancelOrder', { orderId });
            onChanged();
            return 'Order cancelled';
          }}
        />
      )}
    </div>
  );
}

export function Orders() {
  const [orders, setOrders] = useState<OrderSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tag, setTag] = useState('');
  const [searched, setSearched] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback((forTag: string | null) => {
    setError(null);
    setOrders(null);
    const request =
      forTag === null
        ? call<undefined, { orders: OrderSummary[] }>('orders-listRecentOrders')
        : call<{ tag: string }, { orders: OrderSummary[] }>('orders-searchOrders', { tag: forTag });
    request.then((res) => setOrders(res.orders)).catch((err) => setError(errorMessage(err)));
  }, []);
  useEffect(() => load(searched), [load, searched]);

  const search = (e: FormEvent) => {
    e.preventDefault();
    setSearched(tag.trim() ? tag.trim() : null);
  };

  return (
    <section>
      <form onSubmit={search} className="search">
        <label>
          Search by tag
          <input value={tag} onChange={(e) => setTag(e.target.value)} placeholder="e.g. birthday" />
        </label>
        <button type="submit">Search</button>
        {searched && <button type="button" onClick={() => { setTag(''); setSearched(null); }}>Show recent orders</button>}
      </form>
      {error && (
        <div role="alert" className="error">
          <p>We could not load your orders: {error}</p>
          <button onClick={() => load(searched)}>Try again</button>
        </div>
      )}
      {!error && !orders && <p>Loading your orders…</p>}
      {orders?.length === 0 && <p>{searched ? `No orders tagged "${searched}".` : 'You have not placed an order yet.'}</p>}
      <ul className="orders">
        {orders?.map((o) => (
          <li key={o.id}>
            <strong>{new Date(o.createdAt).toLocaleString()}</strong>
            <span>{o.lines.map((l) => `${l.qty} × ${l.name}`).join(', ')}</span>
            <span>
              {money(o.subtotalCents - o.discountCents + o.giftWrapCents)}
              {o.couponCode && ` (coupon ${o.couponCode})`}
              {o.status === 'cancelled' && ' · cancelled'}
            </span>
            <button onClick={() => setOpen(open === o.id ? null : o.id)}>{open === o.id ? 'Hide' : 'Details'}</button>
            {open === o.id && <OrderDetails orderId={o.id} onChanged={() => load(searched)} />}
          </li>
        ))}
      </ul>
    </section>
  );
}
