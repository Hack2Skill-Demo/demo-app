import { useCallback, useEffect, useState } from 'react';
import type { CycleView, HealthStrip, ScenarioView } from '../control';
import { call, errorMessage } from '../firebase';
import { endsLine, noTrafficRecorded } from '../lab';

/** The Lab page talks only to the demo controller's `control-*` callables. A press sends a scenario id and nothing else. */
const REFRESH_MS = 5000;

function Health({ strip }: { strip: HealthStrip }) {
  return (
    <ul className="health" aria-label="Feature health">
      {strip.features.map((f) => (
        <li key={f.feature} title={`${f.label}: ${f.status}${f.successRate === null ? '' : `, ${Math.round(f.successRate * 100)}% ok`}`}>
          <span className={`dot ${f.status}`} aria-hidden /> {f.label} <span className="sr">{f.status}</span>
        </li>
      ))}
    </ul>
  );
}

export function Lab() {
  const [scenarios, setScenarios] = useState<ScenarioView[] | null>(null);
  const [cycle, setCycle] = useState<CycleView | null>(null);
  const [health, setHealth] = useState<HealthStrip | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [healthError, setHealthError] = useState(false);
  const [pressing, setPressing] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const loadScenarios = useCallback(() => {
    setError(null);
    call<undefined, { scenarios: ScenarioView[] }>('control-getScenarios')
      .then((res) => setScenarios(res.scenarios))
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

  const active = cycle?.state === 'active';
  return (
    <section>
      <h2>Lab</h2>
      <p className="hint">
        Each Run button breaks one part of this shop on purpose, by changing the world around it (its traffic, a vendor it
        calls, its cloud project), never its code. Under each button: what stops working, where in the shop to see it,
        and what Starfish, which watches the shop's error logs, is expected to do (for noise, nothing). One scenario runs
        at a time.
      </p>
      {healthError && <p role="alert" className="error">Health is unavailable right now.</p>}
      {health && <Health strip={health} />}
      {health && noTrafficRecorded(health) && (
        <p role="status" className="error">
          No shop traffic was recorded in the last {health.windowMinutes} minutes, so the fake customers do not seem to be
          running. A Run press that changes their traffic will not reach the shop, and Starfish will have nothing to notice.
        </p>
      )}
      {cycle && (
        <p role="status">
          {cycle.scenarioId} {cycle.scenarioTitle && `(${cycle.scenarioTitle})`}: {cycle.state}
          {active && cycle.remainingSeconds !== null && `, ${Math.ceil(cycle.remainingSeconds / 60)} min left`}
          {cycle.failure && ` — ${cycle.failure}`}
          {active && `. ${endsLine(cycle)}`}
        </p>
      )}
      {error && (
        <div role="alert" className="error">
          <p>Could not load the scenarios: {error}</p>
          <button onClick={loadScenarios}>Try again</button>
        </div>
      )}
      {!error && !scenarios && <p>Loading scenarios…</p>}
      {scenarios?.length === 0 && <p>No scenarios are available.</p>}
      <ul className="scenarios">
        {scenarios?.map((s) => (
          <li key={s.id}>
            <strong>{s.id}</strong> <span>{s.title}</span>
            <span>Last result: {s.lastResult ? s.lastResult.outcome : 'never run'}</span>
            <button
              disabled={!s.pressable || active || pressing !== null}
              title={s.pressable ? s.expected : s.notPressableReason}
              onClick={() => void press(s.id)}
            >
              {pressing === s.id ? 'Starting…' : 'Run'}
            </button>
            {s.pressable && (s.clues ?? []).length > 0 && (
              <ul className="clues">
                {(s.clues ?? []).map((c) => (
                  <li key={c.breaks}>
                    <span aria-hidden>⚠ </span>Breaks: {c.breaks}
                    {c.where && <> <em>See it: {c.where}</em></>}
                  </li>
                ))}
              </ul>
            )}
            {s.pressable && s.expected && <small className="muted">Expected from Starfish: {s.expected}</small>}
            {!s.pressable && s.notPressableReason && <small className="muted">{s.notPressableReason}</small>}
          </li>
        ))}
      </ul>
      {note && <p role="status">{note}</p>}
    </section>
  );
}
