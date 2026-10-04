export interface DayRange {
  /** YYYY-MM-DD, UTC. */
  date: string;
  startMs: number;
  endMs: number;
}

/** The UTC day before `nowMs`: what the nightly export covers. */
export function yesterdayUtc(nowMs: number): DayRange {
  const now = new Date(nowMs);
  const endMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const startMs = endMs - 24 * 60 * 60 * 1000;
  return { date: new Date(startMs).toISOString().slice(0, 10), startMs, endMs };
}
