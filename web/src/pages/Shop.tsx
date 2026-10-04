import { collection, doc, getDoc, getDocs, orderBy, query } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { GIFT_WRAP_CENTS } from '../../../shared/pricing';
import type { CreateOrderRequest, Fulfillment, Product } from '../../../shared/types';
import { call, db, errorMessage } from '../firebase';
import { money } from '../format';

export function Shop({ onOrdered }: { onOrdered: () => void }) {
  const [products, setProducts] = useState<Product[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [coupon, setCoupon] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [giftWrap, setGiftWrap] = useState(false);
  const [delivery, setDelivery] = useState(false);
  const [address, setAddress] = useState('');
  const [tags, setTags] = useState('');
  const [cardCode, setCardCode] = useState('');
  const [cardBalance, setCardBalance] = useState<number | null>(null);
  const [cardError, setCardError] = useState<string | null>(null);

  useEffect(() => {
    // One cheap read of the document the cache warmer keeps fresh; read the products if it is missing or stale.
    const fromCache = async (): Promise<Product[] | null> => {
      const snap = await getDoc(doc(db, 'cache', 'catalog'));
      const refreshed = (snap.get('refreshedAt') as { toMillis(): number } | undefined)?.toMillis();
      if (!snap.exists() || !refreshed || Date.now() - refreshed > 30 * 60 * 1000) return null;
      return snap.get('products') as Product[];
    };
    const fromProducts = async (): Promise<Product[]> =>
      (await getDocs(query(collection(db, 'products'), orderBy('name')))).docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<Product, 'id'>),
      }));
    fromCache()
      .catch(() => null)
      .then((cached) => cached ?? fromProducts())
      .then(setProducts)
      .catch((err) => setLoadError(errorMessage(err)));
  }, []);

  const applyCard = async () => {
    setCardError(null);
    setCardBalance(null);
    try {
      setCardBalance((await call<{ code: string }, { balanceCents: number }>('orders-applyGiftCard', { code: cardCode })).balanceCents);
    } catch (err) {
      setCardError(errorMessage(err));
    }
  };

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
        ...(cardBalance !== null ? { giftCardCode: cardCode } : {}),
        giftWrap,
        fulfillment: (delivery ? { type: 'delivery', address } : { type: 'pickup', location: '' }) satisfies Fulfillment,
        tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
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
            <p>Subtotal {money(subtotal)}{giftWrap && ` + gift wrap ${money(GIFT_WRAP_CENTS)}`}</p>
            <label>
              <input type="checkbox" checked={giftWrap} onChange={(e) => setGiftWrap(e.target.checked)} /> Gift wrap
            </label>
            <label>
              <input type="checkbox" checked={delivery} onChange={(e) => setDelivery(e.target.checked)} /> Deliver to me (otherwise pick up in store)
            </label>
            {delivery && (
              <label>
                Delivery address
                <input value={address} onChange={(e) => setAddress(e.target.value)} />
              </label>
            )}
            <label>
              Tags (comma separated, optional)
              <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="birthday, gift" />
            </label>
            <label>
              Gift card
              <input value={cardCode} onChange={(e) => { setCardCode(e.target.value); setCardBalance(null); }} placeholder="optional" />
            </label>
            {cardCode.trim() && (
              <button className="link" onClick={() => void applyCard()}>Check balance</button>
            )}
            {cardBalance !== null && <p>Gift card balance: {money(cardBalance)}. It will be used at checkout.</p>}
            {cardError && <p role="alert" className="error">{cardError}</p>}
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
