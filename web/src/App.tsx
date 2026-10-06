import { onAuthStateChanged, signInAnonymously, signOut, type User } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { auth, db } from './firebase';
import { EntryScreen } from './pages/EntryScreen';
import { Lab } from './pages/Lab';
import { Orders } from './pages/Orders';
import { Reports } from './pages/Reports';
import { Shop } from './pages/Shop';
import { Support } from './pages/Support';

type Page = 'shop' | 'orders' | 'reports' | 'support' | 'lab';
const LABELS: Record<Page, string> = { shop: 'Shop', orders: 'My orders', reports: 'Reports', support: 'Support', lab: 'Lab' };
type Gate = { state: 'loading' } | { state: 'locked' } | { state: 'open'; user: User };

/** A browser is unlocked while it holds an unexpired grant, or when a team member is signed in. */
async function hasAccess(user: User): Promise<boolean> {
  if (!user.isAnonymous) {
    const token = await user.getIdTokenResult();
    if (token.claims.demoTeam === true) return true;
  }
  const grant = await getDoc(doc(db, 'accessGrants', user.uid));
  const expiresAt = grant.get('expiresAt') as { toMillis(): number } | undefined;
  return !!expiresAt && expiresAt.toMillis() > Date.now();
}

export function App() {
  const [gate, setGate] = useState<Gate>({ state: 'loading' });
  const [page, setPage] = useState<Page>('shop');

  const evaluate = async (user: User | null) => {
    if (!user) {
      await signInAnonymously(auth);
      return;
    }
    setGate((await hasAccess(user)) ? { state: 'open', user } : { state: 'locked' });
  };

  useEffect(() => onAuthStateChanged(auth, (user) => void evaluate(user)), []);

  if (gate.state === 'loading') return <p className="center">Loading…</p>;
  if (gate.state === 'locked') return <EntryScreen onUnlocked={() => void evaluate(auth.currentUser)} />;

  return (
    <div className="app">
      <header>
        <h1>Demo Shop</h1>
        <nav>
          {(Object.keys(LABELS) as Page[]).map((p) => (
            <button key={p} aria-current={page === p} onClick={() => setPage(p)}>
              {LABELS[p]}
            </button>
          ))}
          <button onClick={() => void signOut(auth)}>Leave</button>
        </nav>
      </header>
      {page !== 'lab' && (
        <p className="hint banner">
          This is a demo shop. Open the{' '}
          <button className="link" onClick={() => setPage('lab')}>
            Lab
          </button>{' '}
          to break one part of it on purpose: each button says what will fail and where to see it.
        </p>
      )}
      <main>
        {page === 'shop' && <Shop onOrdered={() => setPage('orders')} />}
        {page === 'orders' && <Orders />}
        {page === 'reports' && <Reports />}
        {page === 'support' && <Support />}
        {page === 'lab' && <Lab />}
      </main>
    </div>
  );
}
