/** What the Lab page says about the controller's answers. Pure, so it is tested without a browser. */
import type { CycleView, HealthStrip } from './control';

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
  return `It runs until its deadline${time ? ` (${time})` : ''} unless the team resets it first, and is then recorded as timed out. Run buttons unlock when it ends.`;
}
