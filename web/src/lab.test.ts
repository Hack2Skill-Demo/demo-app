import { describe, expect, it } from 'vitest';
import type { FeatureHealth, HealthStrip } from './control';
import { deadlineTime, endsLine, noTrafficRecorded } from './lab';

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
