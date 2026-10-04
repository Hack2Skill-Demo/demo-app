import { defineString } from 'firebase-functions/params';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import type { Scenario } from '../../../shared/types';
import { fetchJson } from '../lib/http';
import { requireGrant } from '../lib/guards';
import { tracked } from '../lib/track';

/** Base URL of the demo controller, set per deployment in functions/.env.<project>. */
const controllerUrl = defineString('DEMO_CONTROLLER_URL', { default: '' });

const SCENARIO_ID = /^[a-z0-9][a-z0-9-]{0,63}$/;

function controller(): string {
  const url = controllerUrl.value().replace(/\/+$/, '');
  if (!url) throw new HttpsError('failed-precondition', 'The demo controller is not configured');
  return url;
}

export const lab = {
  /** Scenarios are loaded at runtime from the demo controller, so adding one needs no deploy. */
  listScenarios: onCall(
    tracked<unknown, { scenarios: Scenario[] }>('lab', async (req) => {
      await requireGrant(req);
      return fetchJson<{ scenarios: Scenario[] }>(`${controller()}/scenarios`, { timeoutMs: 8000 });
    }),
  ),

  /** A press sends only the scenario id; what the scenario does is the controller's business. */
  runScenario: onCall(
    tracked<{ scenarioId?: unknown }, { result: string }>('lab', async (req) => {
      await requireGrant(req);
      const id = req.data?.scenarioId;
      if (typeof id !== 'string' || !SCENARIO_ID.test(id)) throw new HttpsError('invalid-argument', 'Unknown scenario');
      return fetchJson<{ result: string }>(`${controller()}/scenarios/run`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ scenarioId: id }),
        timeoutMs: 15000,
      });
    }),
  ),
};
