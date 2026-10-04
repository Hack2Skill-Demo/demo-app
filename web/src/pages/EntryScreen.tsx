import { signInWithEmailAndPassword } from 'firebase/auth';
import { useState, type FormEvent } from 'react';
import { auth, call, errorMessage } from '../firebase';

/** The only screen a visitor sees until they enter a valid access code. */
export function EntryScreen({ onUnlocked }: { onUnlocked: () => void }) {
  const [code, setCode] = useState('');
  const [team, setTeam] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (team) await signInWithEmailAndPassword(auth, email, password);
      else {
        await call('access-redeemCode', { code });
        // The grant also set a claim on this account; fetch a token that carries it.
        await auth.currentUser?.getIdToken(true);
      }
      onUnlocked();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="entry" onSubmit={(e) => void submit(e)}>
      <h1>Demo Shop</h1>
      {team ? (
        <>
          <label>
            Email
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required />
          </label>
          <label>
            Password
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
          </label>
        </>
      ) : (
        <label>
          Access code
          <input value={code} onChange={(e) => setCode(e.target.value)} autoComplete="off" autoCapitalize="characters" required />
        </label>
      )}
      {error && <p role="alert" className="error">{error}</p>}
      <button type="submit" disabled={busy}>{busy ? 'Checking…' : 'Enter'}</button>
      <button type="button" className="link" onClick={() => { setTeam(!team); setError(null); }}>
        {team ? 'Use an access code' : 'Team sign-in'}
      </button>
    </form>
  );
}
