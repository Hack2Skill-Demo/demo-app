import { describe, expect, it } from 'vitest';
import type { FeatureHealth, HealthStrip } from './control';
import { BEHAVIOURS, behaviourOf, deadlineTime, endsLine, noTrafficRecorded, outcomesKnown, runnable } from './lab';

const feature = (status: FeatureHealth['status']): FeatureHealth => ({
  feature: 'checkout',
  label: 'Checkout',
  status,
  successRate: status === 'unknown' ? null : 1,
  ok: status === 'unknown' ? 0 : 3,
  failed: 0,
});
const strip = (...statuses: FeatureHealth['status'][]): HealthStrip => ({ windowMinutes: 5, features: statuses.map(feature) });

describe('noTrafficRecorded', () => {
  it('is true when no feature has an outcome in the window', () => {
    expect(noTrafficRecorded(strip('unknown', 'unknown'))).toBe(true);
  });

  it('is false as soon as one feature has an outcome, failing included', () => {
    expect(noTrafficRecorded(strip('unknown', 'healthy'))).toBe(false);
    expect(noTrafficRecorded(strip('failing', 'unknown'))).toBe(false);
  });

  it('says nothing about a strip with no features', () => {
    expect(noTrafficRecorded(strip())).toBe(false);
  });
});

describe('endsLine', () => {
  it('names the deadline and says the cycle is then recorded as timed out', () => {
    const cycle = { deadline: '2026-10-10T15:34:40.789Z' };
    const time = deadlineTime(cycle);
    expect(time).not.toBeNull();
    expect(endsLine(cycle)).toBe(
      `It runs until its deadline (${time}) unless the team resets it first, and is then recorded as timed out. Run buttons unlock when it ends.`
    );
  });

  it('leaves the time out when the deadline does not parse', () => {
    expect(deadlineTime({ deadline: 'soon' })).toBeNull();
    expect(endsLine({ deadline: 'soon' })).toBe(
      'It runs until its deadline unless the team resets it first, and is then recorded as timed out. Run buttons unlock when it ends.'
    );
  });
});

describe('behaviourOf', () => {
  it('puts each of the controller\'s outcomes in the group the Lab filter names', () => {
    const groups = {
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
      'incident-recorded': 'other',
      'no-incident': 'other',
      'dry-run': 'other',
    };
    for (const [outcome, group] of Object.entries(groups)) expect(behaviourOf({ outcome })).toBe(group);
  });

  it('calls a scenario with no outcome, or one it does not know, other', () => {
    expect(behaviourOf({})).toBe('other');
    expect(behaviourOf({ outcome: 'something-new' })).toBe('other');
  });

  it('offers every group exactly once', () => {
    const ids = BEHAVIOURS.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain('other');
  });
});

describe('outcomesKnown', () => {
  it('is false when no scenario has an outcome, as from a controller deployed before it sent them', () => {
    expect(outcomesKnown([{}, {}])).toBe(false);
    expect(outcomesKnown([])).toBe(false);
  });

  it('is true as soon as one scenario has an outcome', () => {
    expect(outcomesKnown([{}, { outcome: 'decline' }])).toBe(true);
  });
});

describe('runnable', () => {
  it('keeps only the scenarios the Run button can start, in order', () => {
    const list = [
      { id: 'CODE-01', pressable: true },
      { id: 'FR-01', pressable: false },
      { id: 'IDX-02', pressable: true },
      { id: 'CON-01', pressable: false },
    ];
    expect(runnable(list).map((s) => s.id)).toEqual(['CODE-01', 'IDX-02']);
    expect(runnable([])).toEqual([]);
  });
});
