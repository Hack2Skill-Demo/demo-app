import { collection, getDocs, orderBy, query } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import type { CreateOrderRequest, Product } from '../../../shared/types';
import { call, db, errorMessage } from '../firebase';
import { money } from '../format';

export function Shop({ onOrdered }: { onOrdered: () => void }) {
  const [products, setProducts] = useState<Product[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [coupon, setCoupon] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getDocs(query(collection(db, 'products'), orderBy('name')))
      .then((snap) => setProducts(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Product, 'id'>) }))))
      .catch((err) => setLoadError(errorMessage(err)));
  }, []);

  if (loadError) return <p role="alert" className="error">Could not load products: {loadError}</p>;
  if (!products) return <p>Loading products…</p>;
  if (products.length === 0) return <p>No products yet.</p>;

  const entries = Object.entries(cart).filter(([, qty]) => qty > 0);
  const subtotal = entries.reduce((sum, [id, qty]) => sum + (products.find((p) => p.id === id)?.priceCents ?? 0) * qty, 0);

  const checkout = async () => {
    setBusy(true);
    setError(null);
    try {
      const body: CreateOrderRequest = {
        items: entries.map(([productId, qty]) => ({ productId, qty })),
        ...(coupon.trim() ? { coupon: coupon.trim() } : {}),
      };
      await call('orders-createOrder', body);
      setCart({});
      setCoupon('');
      onOrdered();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="shop">
      <ul className="products">
        {products.map((p) => (
          <li key={p.id}>
            <span>{p.name}</span>
            <span>{money(p.priceCents)}</span>
            <button onClick={() => setCart({ ...cart, [p.id]: (cart[p.id] ?? 0) + 1 })}>Add</button>
          </li>
        ))}
      </ul>
      <aside className="cart">
        <h2>Cart</h2>
        {entries.length === 0 ? (
          <p>Your cart is empty.</p>
        ) : (
          <>
            <ul>
              {entries.map(([id, qty]) => (
                <li key={id}>
                  {qty} × {products.find((p) => p.id === id)?.name}
                  <button className="link" onClick={() => setCart({ ...cart, [id]: qty - 1 })}>remove one</button>
                </li>
              ))}
            </ul>
            <p>Subtotal {money(subtotal)}</p>
            <label>
              Coupon
              <input value={coupon} onChange={(e) => setCoupon(e.target.value)} placeholder="optional" />
            </label>
            {error && <p role="alert" className="error">{error}</p>}
            <button disabled={busy} onClick={() => void checkout()}>{busy ? 'Placing order…' : 'Check out'}</button>
          </>
        )}
      </aside>
    </div>
  );
}
