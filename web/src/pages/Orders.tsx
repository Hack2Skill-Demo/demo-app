import { useCallback, useEffect, useState } from 'react';
import type { OrderSummary } from '../../../shared/types';
import { call, errorMessage } from '../firebase';
import { money } from '../format';

export function Orders() {
  const [orders, setOrders] = useState<OrderSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    setOrders(null);
    call<undefined, { orders: OrderSummary[] }>('orders-listRecentOrders')
      .then((res) => setOrders(res.orders))
      .catch((err) => setError(errorMessage(err)));
  }, []);
  useEffect(load, [load]);

  if (error) {
    return (
      <div role="alert" className="error">
        <p>We could not load your orders: {error}</p>
        <button onClick={load}>Try again</button>
      </div>
    );
  }
  if (!orders) return <p>Loading your orders…</p>;
  if (orders.length === 0) return <p>You have not placed an order yet.</p>;

  return (
    <ul className="orders">
      {orders.map((o) => (
        <li key={o.id}>
          <strong>{new Date(o.createdAtMs).toLocaleString()}</strong>
          <span>{o.lines.map((l) => `${l.qty} × ${l.name}`).join(', ')}</span>
          <span>
            {money(o.totalCents)}
            {o.coupon && ` (coupon ${o.coupon})`}
          </span>
        </li>
      ))}
    </ul>
  );
}
