import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { isServerFault } from '../../../shared/health';

/**
 * Run a piece of work and log it if it fails. The error log is what Starfish reads, so a server fault is logged at
 * error level with its message; a client mistake (a wrong code, an expired coupon) is only a warning.
 */
export async function trackOutcome<R>(name: string, work: () => Promise<R>): Promise<R> {
  try {
    return await work();
  } catch (err) {
    const code = err instanceof HttpsError ? err.code : undefined;
    const message = err instanceof Error ? err.message : String(err);
    if (isServerFault(code)) logger.error(`${name} failed: ${message}`, { err: err instanceof Error ? err.stack : err });
    else logger.warn(`${name} refused: ${message}`, { code });
    throw err;
  }
}

/** Wrap a callable's handler with trackOutcome. */
export function tracked<T, R>(name: string, handler: (req: CallableRequest<T>) => Promise<R>) {
  return (req: CallableRequest<T>): Promise<R> => trackOutcome(name, () => handler(req));
}
