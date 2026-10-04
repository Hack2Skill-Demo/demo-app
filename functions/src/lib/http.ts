import { HttpsError } from 'firebase-functions/v2/https';

/** Call a configured upstream URL with a hard deadline. */
export async function fetchJson<T>(url: string, init: RequestInit & { timeoutMs: number }): Promise<T> {
  const { timeoutMs, ...rest } = init;
  let res: Response;
  try {
    res = await fetch(url, { ...rest, signal: AbortSignal.timeout(timeoutMs) });
  } catch (err) {
    const timedOut = err instanceof Error && err.name === 'TimeoutError';
    throw new HttpsError(
      timedOut ? 'deadline-exceeded' : 'unavailable',
      timedOut ? `DEADLINE_EXCEEDED: no answer within ${timeoutMs} ms: ${url}` : `Upstream did not answer: ${url}`,
    );
  }
  if (!res.ok) throw new HttpsError('unavailable', `Upstream answered ${res.status}: ${url}`);
  return (await res.json()) as T;
}
