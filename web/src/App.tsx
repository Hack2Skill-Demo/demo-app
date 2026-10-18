import { onAuthStateChanged, signInAnonymously, type User } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { markAboutSeen, shouldAutoOpenAbout } from './about';
import { AboutDialog } from './AboutDialog';
import { auth, call, db, errorMessage } from './firebase';
import { Lab } from './pages/Lab';
import { Orders } from './pages/Orders';
import { Reports } from './pages/Reports';
import { Shop } from './pages/Shop';
import { Support } from './pages/Support';
import { pageFromHash, type Page } from './route';

const LABELS: Record<Page, string> = { shop: 'Shop', orders: 'My orders', reports: 'Reports', support: 'Support', lab: 'Lab' };
type Gate = { state: 'loading' } | { state: 'error'; message: string } | { state: 'open'; user: User };

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
  // A link may open a page directly (Starfish's demo links to `/#lab`).
  const [page, setPage] = useState<Page>(() => pageFromHash(window.location.hash));
  const [aboutOpen, setAboutOpen] = useState(false);

  const evaluate = async (user: User | null) => {
    if (!user) {
      await signInAnonymously(auth);
      return;
    }
    // No login: a visitor without a grant is given an open one, and a token that carries its claim.
    try {
      if (!(await hasAccess(user))) {
        await call('access-enter');
        await user.getIdToken(true);
      }
      setGate({ state: 'open', user });
    } catch (err) {
      setGate({ state: 'error', message: errorMessage(err) });
    }
  };

  useEffect(() => onAuthStateChanged(auth, (user) => void evaluate(user)), []);

  // Once a visitor is in, the shop says what it is, once per browser: a judge may arrive here before reading Starfish.
  const isOpen = gate.state === 'open';
  useEffect(() => {
    if (isOpen && shouldAutoOpenAbout()) {
      setAboutOpen(true);
      markAboutSeen();
    }
  }, [isOpen]);

  if (gate.state === 'loading') return <p className="center">Loading…</p>;
  if (gate.state === 'error') return <p role="alert" className="center error">{gate.message}</p>;

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
          <button onClick={() => setAboutOpen(true)}>About</button>
        </nav>
      </header>
      {page !== 'lab' && (
        <p className="hint banner">
          This is a demo shop that{' '}
          <button className="link" onClick={() => setAboutOpen(true)}>
            Starfish watches
          </button>
          . Open the{' '}
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
      <AboutDialog
        open={aboutOpen}
        onClose={() => setAboutOpen(false)}
        onOpenLab={() => {
          setAboutOpen(false);
          setPage('lab');
        }}
      />
    </div>
  );
}
