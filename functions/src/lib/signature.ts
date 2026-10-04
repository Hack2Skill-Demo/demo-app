import { createHmac, timingSafeEqual } from 'node:crypto';

/** Header format: `sha256=<hex HMAC of the raw request body>`. */
export function sign(rawBody: Buffer | string, secret: string): string {
  return `sha256=${createHmac('sha256', secret).update(rawBody).digest('hex')}`;
}

export function verifySignature(rawBody: Buffer | string, header: string | undefined, secret: string): boolean {
  if (!header || !secret) return false;
  const expected = Buffer.from(sign(rawBody, secret));
  const given = Buffer.from(header);
  return expected.length === given.length && timingSafeEqual(expected, given);
}
