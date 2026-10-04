import { collection, doc, onSnapshot } from 'firebase/firestore';
import { useCallback, useEffect, useState } from 'react';
import { FEATURES } from '../../../shared/features';
import { healthColor } from '../../../shared/health';
import type { DeploymentRecord, Scenario } from '../../../shared/types';
import { call, db, errorMessage } from '../firebase';

function HealthStrip() {
  const [recent, setRecent] = useState<Record<string, boolean[]>>({});
  const [error, setError] = useState(false);

  useEffect(
    () =>
      onSnapshot(
        collection(db, 'featureHealth'),
        (snap) => setRecent(Object.fromEntries(snap.docs.map((d) => [d.id, (d.get('recent') as boolean[]) ?? []]))),
        () => setError(true),
      ),
    [],
  );

  if (error) return <p role="alert" className="error">Health is unavailable right now.</p>;
  return (
    <ul className="health" aria-label="Feature health">
      {FEATURES.map((f) => {
        const color = healthColor(recent[f.id] ?? []);
        return (
          <li key={f.id} title={`${f.label}: ${color}`}>
            <span className={`dot ${color}`} aria-hidden /> {f.label} <span className="sr">{color}</span>
          </li>
        );
      })}
    </ul>
  );
}

/** Which commit is live, from the record the deploy pipeline writes. */
function LiveCommit() {
  const [live, setLive] = useState<DeploymentRecord | null | undefined>(undefined);

  useEffect(
    () =>
      onSnapshot(
        doc(db, 'deployments', 'current'),
        (snap) =>
          setLive(
            snap.exists()
              ? { commit: String(snap.get('commit')), deployedAtMs: (snap.get('deployedAt') as { toMillis(): number }).toMillis() }
              : null,
          ),
        () => setLive(null),
      ),
    [],
  );

  if (live === undefined) return null;
  if (live === null) return <p>Live commit: unknown</p>;
  return (
    <p>
      Live commit: <code>{live.commit.slice(0, 7)}</code> since {new Date(live.deployedAtMs).toLocaleString()}
    </p>
  );
}

export function Lab() {
  const [scenarios, setScenarios] = useState<Scenario[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    call<undefined, { scenarios: Scenario[] }>('lab-listScenarios')
      .then((res) => setScenarios(res.scenarios))
      .catch((err) => setError(errorMessage(err)));
  }, []);
  useEffect(load, [load]);

  const press = async (id: string) => {
    setRunning(id);
    setNote(null);
    try {
      const res = await call<{ scenarioId: string }, { result: string }>('lab-runScenario', { scenarioId: id });
      setNote(`${id}: ${res.result}`);
      load();
    } catch (err) {
      setNote(`${id} failed: ${errorMessage(err)}`);
    } finally {
      setRunning(null);
    }
  };

  return (
    <section>
      <h2>Lab</h2>
      <HealthStrip />
      <LiveCommit />
      {error && (
        <div role="alert" className="error">
          <p>Could not load the scenarios: {error}</p>
          <button onClick={load}>Try again</button>
        </div>
      )}
      {!error && !scenarios && <p>Loading scenarios…</p>}
      {scenarios?.length === 0 && <p>No scenarios are available.</p>}
      <ul className="scenarios">
        {scenarios?.map((s) => (
          <li key={s.id}>
            <strong>{s.title}</strong>
            <span>State: {s.state}</span>
            <span>Last result: {s.lastResult ?? 'never run'}</span>
            <button disabled={running !== null} onClick={() => void press(s.id)}>{running === s.id ? 'Running…' : 'Run'}</button>
          </li>
        ))}
      </ul>
      {note && <p role="status">{note}</p>}
    </section>
  );
}
