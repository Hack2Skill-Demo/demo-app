import { useCallback, useEffect, useState } from 'react';
import type { CycleView, FeatureHealth, HealthStrip, ScenarioView } from '../control';
import { call, errorMessage } from '../firebase';
import { BEHAVIOURS, behaviourOf, endsLine, noTrafficRecorded, outcomesKnown, runnable, type Behaviour } from '../lab';

/**
 * The Lab page talks only to the demo controller's `control-*` callables. A press sends a scenario id and nothing else;
 * Stop sends the running cycle's id and nothing else.
 */
const REFRESH_MS = 5000;

const LEGEND: ReadonlyArray<{ status: FeatureHealth['status']; label: string }> = [
  { status: 'healthy', label: 'working' },
  { status: 'degraded', label: 'some requests failing' },
  { status: 'failing', label: 'failing' },
  { status: 'unknown', label: 'no traffic yet' },
];

/** A feature's success rate, shown only when something is wrong; a healthy one hides it so the strip stays quiet. */
const rate = (f: FeatureHealth) =>
  f.successRate !== null && (f.status === 'degraded' || f.status === 'failing') ? ` (${Math.round(f.successRate * 100)}% ok)` : '';

function Health({ strip }: { strip: HealthStrip }) {
  return (
    <div className="health-box">
      <h3>Shop health, last {strip.windowMinutes} minutes</h3>
      <p className="legend muted">
        From the fake customers' requests to each feature:{' '}
        {LEGEND.map((l) => (
          <span key={l.status}>
            <span className={`dot ${l.status}`} aria-hidden /> {l.label}
          </span>
        ))}
      </p>
      <ul className="health" aria-label="Feature health">
        {strip.features.map((f) => (
          <li key={f.feature} title={`${f.label}: ${f.status}${f.successRate === null ? '' : `, ${Math.round(f.successRate * 100)}% ok`}`}>
            <span className={`dot ${f.status}`} aria-hidden /> {f.label}
            {rate(f)} <span className="sr">{f.status}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The current cycle: a running one says what is running and how it ends; an ended one is the last result. */
function Cycle({ cycle, stopping, onStop }: { cycle: CycleView; stopping: boolean; onStop: () => void }) {
  const active = cycle.state === 'active';
  const name = `${cycle.scenarioId}${cycle.scenarioTitle ? ` — ${cycle.scenarioTitle}` : ''}`;
  return (
    <div role="status" className={`cycle${active ? ' active' : ''}`}>
      <div className="cycle-head">
        <strong>{active ? 'Running now' : 'Last triggered'}: {name}</strong>
        {active && (
          <button className="stop" disabled={stopping} onClick={onStop}>
            {stopping ? 'Stopping…' : 'Stop'}
          </button>
        )}
      </div>
      <p>
        {active ? (
          <>
            {cycle.remainingSeconds !== null && `${Math.ceil(cycle.remainingSeconds / 60)} min left. `}
            {endsLine(cycle)}
          </>
        ) : (
          <>Ended: {cycle.state.replace(/_/g, ' ')}</>
        )}
        {cycle.failure && ` — ${cycle.failure}`}
      </p>
    </div>
  );
}

export function Lab() {
  const [scenarios, setScenarios] = useState<ScenarioView[] | null>(null);
  const [cycle, setCycle] = useState<CycleView | null>(null);
  const [health, setHealth] = useState<HealthStrip | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [healthError, setHealthError] = useState(false);
  const [pressing, setPressing] = useState<string | null>(null);
  const [stopping, setStopping] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [behaviour, setBehaviour] = useState<Behaviour | 'all'>('all');

  const loadScenarios = useCallback(() => {
    setError(null);
    call<undefined, { scenarios: ScenarioView[] }>('control-getScenarios')
      .then((res) => setScenarios(runnable(res.scenarios)))
      .catch((err) => setError(errorMessage(err)));
  }, []);

  /** Resolves once the cycle state is in, so a press can keep its buttons locked until the new cycle shows. */
  const refresh = useCallback(() => {
    const state = call<undefined, { cycle: CycleView | null }>('control-getState')
      .then((res) => setCycle(res.cycle))
      .catch(() => undefined);
    call<undefined, HealthStrip>('control-getHealth')
      .then((res) => {
        setHealth(res);
        setHealthError(false);
      })
      .catch(() => setHealthError(true));
    return state;
  }, []);

  useEffect(() => {
    loadScenarios();
    refresh();
    const timer = setInterval(refresh, REFRESH_MS);
    return () => clearInterval(timer);
  }, [loadScenarios, refresh]);

  const press = async (id: string) => {
    setPressing(id);
    setNote(null);
    try {
      await call<{ scenarioId: string }, unknown>('control-triggerFault', { scenarioId: id });
      setNote(`Started ${id}.`);
      loadScenarios();
      await refresh();
    } catch (err) {
      setNote(`${id} could not start: ${errorMessage(err)}`);
    } finally {
      setPressing(null);
    }
  };

  /** Ends the running cycle now. The scenario's traffic stops; a code or cloud change stays until the team's reset. */
  const stop = async (c: CycleView) => {
    setStopping(true);
    setNote(null);
    try {
      const res = await call<{ cycleId: string }, { stopped: boolean }>('control-stopCycle', { cycleId: c.cycleId });
      setNote(res.stopped ? `Stopped ${c.scenarioId}. You can trigger the next one.` : `${c.scenarioId} had already ended.`);
      loadScenarios();
      await refresh();
    } catch (err) {
      setNote(`${c.scenarioId} could not be stopped: ${errorMessage(err)}`);
    } finally {
      setStopping(false);
    }
  };

  const active = cycle?.state === 'active';
  const sortable = scenarios !== null && outcomesKnown(scenarios);
  const shown = sortable && behaviour !== 'all' ? scenarios.filter((s) => behaviourOf(s) === behaviour) : scenarios;
  return (
    <section>
      <h2>Lab</h2>
      <p className="hint">
        Each Trigger Error button breaks one part of this shop on purpose, by changing the world around it (its traffic, a vendor it
        calls, its cloud project), never its code. Under each button: what stops working, where in the shop to see it,
        and what Starfish, which watches the shop's error logs, is expected to do (for noise, nothing). One scenario runs
        at a time.
      </p>
      {healthError && <p role="alert" className="error">Health is unavailable right now.</p>}
      {health && <Health strip={health} />}
      {health && noTrafficRecorded(health) && (
        <p role="status" className="error">
          No shop traffic was recorded in the last {health.windowMinutes} minutes, so the fake customers do not seem to be
          running. A Trigger Error press that changes their traffic will not reach the shop, and Starfish will have nothing to notice.
        </p>
      )}
      {cycle && <Cycle cycle={cycle} stopping={stopping} onStop={() => void stop(cycle)} />}
      {error && (
        <div role="alert" className="error">
          <p>Could not load the scenarios: {error}</p>
          <button onClick={loadScenarios}>Try again</button>
        </div>
      )}
      {!error && !scenarios && <p>Loading scenarios…</p>}
      {scenarios?.length === 0 && <p>No scenarios are available.</p>}
      {sortable && (
        <label className="filter">
          Expected from Starfish{' '}
          <select value={behaviour} onChange={(e) => setBehaviour(e.target.value as Behaviour | 'all')}>
            <option value="all">All ({scenarios.length})</option>
            {BEHAVIOURS.map((b) => (
              <option key={b.id} value={b.id}>
                {b.label} ({scenarios.filter((s) => behaviourOf(s) === b.id).length})
              </option>
            ))}
          </select>
        </label>
      )}
      {scenarios !== null && scenarios.length > 0 && !sortable && (
        <p className="muted">
          The controller does not say yet what Starfish is expected to do for each scenario, so they cannot be filtered by it.
        </p>
      )}
      {shown?.length === 0 && scenarios?.length !== 0 && <p>No scenario expects that from Starfish.</p>}
      <ul className="scenarios">
        {shown?.map((s) => (
          <li key={s.id}>
            <strong>{s.id}</strong> <span>{s.title}</span>
            <span>Last result: {s.lastResult ? s.lastResult.outcome : 'never run'}</span>
            <button
              disabled={active || pressing !== null || stopping}
              title={s.expected}
              onClick={() => void press(s.id)}
            >
              {pressing === s.id ? 'Starting…' : 'Trigger Error'}
            </button>
            {(s.clues ?? []).length > 0 && (
              <ul className="clues">
                {(s.clues ?? []).map((c) => (
                  <li key={c.breaks}>
                    <span aria-hidden>⚠ </span>Breaks: {c.breaks}
                    {c.where && <> <em>See it: {c.where}</em></>}
                  </li>
                ))}
              </ul>
            )}
            {s.expected && <small className="muted">Expected from Starfish: {s.expected}</small>}
          </li>
        ))}
      </ul>
      {note && <p role="status">{note}</p>}
    </section>
  );
}
