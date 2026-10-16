/** What the Lab page says about the controller's answers. Pure, so it is tested without a browser. */
import type { CycleView, HealthStrip, ScenarioView } from './control';

/**
 * No feature has an outcome in the health window. The fake customers place a few ordinary orders every minute, so an
 * empty window means they are not running, and a press that changes their traffic will not reach the shop. A strip
 * with no features says nothing.
 */
export function noTrafficRecorded(strip: HealthStrip): boolean {
  return strip.features.length > 0 && strip.features.every((f) => f.status === 'unknown');
}

/** The cycle's deadline as a local time of day, or null when the controller sent none that parses. */
export function deadlineTime(cycle: Pick<CycleView, 'deadline'>): string | null {
  const at = new Date(cycle.deadline);
  return Number.isNaN(at.getTime()) ? null : at.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/**
 * How a running cycle ends. Nothing on this page ends one: the team's reset does, and otherwise the deadline, which
 * the controller records as `timed_out`.
 */
export function endsLine(cycle: Pick<CycleView, 'deadline'>): string {
  const time = deadlineTime(cycle);
  return `Ends ${time ? `at ${time}` : 'at its deadline'}, or sooner if the team resets it. Trigger Error buttons are locked until then.`;
}

/** What Starfish is expected to do after a press, as the Lab's filter groups it. */
export type Behaviour = 'pr' | 'pr-merged' | 'draft-fix' | 'declined' | 'waiting-for-human' | 'handed-to-person' | 'other';

/** The filter's options, in the order the Lab lists them. */
export const BEHAVIOURS: ReadonlyArray<{ id: Behaviour; label: string }> = [
  { id: 'pr', label: 'Opens a PR' },
  { id: 'pr-merged', label: 'Opens a PR and merges it' },
  { id: 'draft-fix', label: 'Drafts a fix (its checks stop it)' },
  { id: 'declined', label: 'Triages and declines' },
  { id: 'waiting-for-human', label: 'Triages and waits for a human' },
  { id: 'handed-to-person', label: 'Drafts a fix and hands it to a person' },
  { id: 'other', label: 'Other (records an incident, or nothing)' },
];

/** The controller's outcomes, each in exactly one group. An outcome missing here, or none at all, is `other`. */
const BY_OUTCOME: Record<string, Behaviour> = {
  'evidence-pr': 'pr',
  revert: 'pr',
  'fix-pr-merged': 'pr-merged',
  blocked: 'draft-fix',
  decline: 'declined',
  notify: 'waiting-for-human',
  escalate: 'waiting-for-human',
  refused: 'waiting-for-human',
  'fix-pr-for-human': 'handed-to-person',
  'index-healed': 'handed-to-person',
};

export function behaviourOf(s: Pick<ScenarioView, 'outcome'>): Behaviour {
  return (s.outcome && BY_OUTCOME[s.outcome]) || 'other';
}

/**
 * Whether the controller says what Starfish is expected to do. One deployed before it sent outcomes sends none for any
 * scenario, and then every scenario would land in "Other", so the filter has nothing to sort by.
 */
export function outcomesKnown(scenarios: ReadonlyArray<Pick<ScenarioView, 'outcome'>>): boolean {
  return scenarios.some((s) => s.outcome !== undefined);
}

/**
 * The scenarios the Lab lists: only the ones its Trigger Error button can start. The rest (driven by the team's runner, not
 * producible yet, or deferred) are left out, so a visitor never meets a button that cannot work.
 */
export function runnable<T extends Pick<ScenarioView, 'pressable'>>(scenarios: readonly T[]): T[] {
  return scenarios.filter((s) => s.pressable);
}
