import { doc, onSnapshot } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import type { ExportStatus, WeeklyDigest } from '../../../shared/types';
import { auth, call, db, errorMessage } from '../firebase';
import { money } from '../format';

function RunExport() {
  const [state, setState] = useState<{ kind: 'idle' | 'busy' } | { kind: 'started' | 'failed'; text: string }>({ kind: 'idle' });
  const run = async () => {
    setState({ kind: 'busy' });
    try {
      await call('reports-runNightlyExport');
      setState({ kind: 'started', text: 'Export started. The result appears here in a moment.' });
    } catch (err) {
      setState({ kind: 'failed', text: errorMessage(err) });
    }
  };
  return (
    <p>
      <button disabled={state.kind === 'busy'} onClick={() => void run()}>{state.kind === 'busy' ? 'Starting…' : 'Run export now'}</button>
      {state.kind === 'started' && <span role="status"> {state.text}</span>}
      {state.kind === 'failed' && <span role="alert" className="error"> Could not start the export: {state.text}</span>}
    </p>
  );
}

function Digest() {
  const [digest, setDigest] = useState<WeeklyDigest | null | undefined>(undefined);
  useEffect(
    () =>
      onSnapshot(
        doc(db, 'reports', 'weeklyDigest'),
        (snap) => setDigest(snap.exists() ? ({ ...snap.data(), finishedAtMs: 0 } as WeeklyDigest) : null),
        () => setDigest(null),
      ),
    [],
  );
  if (digest === undefined) return null;
  return (
    <>
      <h3>Weekly sales digest</h3>
      {digest === null ? (
        <p>No digest yet.</p>
      ) : (
        <p>
          {digest.weekStart} to {digest.weekEnd}: {digest.orderCount} orders, {digest.units} items, {money(digest.revenueCents)}.
          {digest.topProducts.length > 0 && ` Top: ${digest.topProducts.map((p) => `${p.name} (${p.units})`).join(', ')}.`}
        </p>
      )}
    </>
  );
}

/** Team members only: the function refuses anyone else, this just hides the form from visitors. */
function CsvImport() {
  const [isTeam, setIsTeam] = useState(false);
  const [state, setState] = useState<{ kind: 'idle' | 'busy' } | { kind: 'done' | 'failed'; text: string }>({ kind: 'idle' });
  useEffect(() => {
    void auth.currentUser?.getIdTokenResult().then((t) => setIsTeam(t.claims.demoTeam === true));
  }, []);
  if (!isTeam) return null;

  const upload = async (file: File) => {
    setState({ kind: 'busy' });
    try {
      const { imported } = await call<{ csv: string }, { imported: number }>('reports-importCsv', { csv: await file.text() });
      setState({ kind: 'done', text: `Imported ${imported} products.` });
    } catch (err) {
      setState({ kind: 'failed', text: errorMessage(err) });
    }
  };

  return (
    <>
      <h3>Import products</h3>
      <p>CSV with the header <code>id,name,price</code>.</p>
      <input type="file" accept=".csv,text/csv" disabled={state.kind === 'busy'} onChange={(e) => e.target.files?.[0] && void upload(e.target.files[0])} />
      {state.kind === 'done' && <p role="status">{state.text}</p>}
      {state.kind === 'failed' && <pre role="alert" className="error">{state.text}</pre>}
    </>
  );
}

export function Reports() {
  const [last, setLast] = useState<ExportStatus | null | undefined>(undefined);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(
    () =>
      onSnapshot(
        doc(db, 'exports', 'last'),
        (snap) =>
          setLast(
            snap.exists()
              ? {
                  status: snap.get('status'),
                  forDate: snap.get('forDate'),
                  orderCount: snap.get('orderCount'),
                  error: snap.get('error') ?? null,
                  finishedAtMs: (snap.get('finishedAt') as { toMillis(): number }).toMillis(),
                }
              : null,
          ),
        () => setLoadFailed(true),
      ),
    [],
  );

  if (loadFailed) return <p role="alert" className="error">Could not load the export status.</p>;
  if (last === undefined) return <p>Loading…</p>;

  return (
    <section>
      <h2>Reports</h2>
      <h3>Nightly export</h3>
      <RunExport />
      {last === null && <p>No export has run yet.</p>}
      {last?.status === 'ready' && (
        <p>
          Ready: {last.orderCount} orders for {last.forDate}, finished {new Date(last.finishedAtMs).toLocaleString()}.
        </p>
      )}
      {last?.status === 'failed' && (
        <p role="alert" className="error">
          Failed for {last.forDate} at {new Date(last.finishedAtMs).toLocaleString()}: {last.error}
        </p>
      )}
      <Digest />
      <CsvImport />
    </section>
  );
}
