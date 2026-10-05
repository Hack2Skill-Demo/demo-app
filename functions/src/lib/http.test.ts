import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchJson } from './http';

afterEach(() => vi.unstubAllGlobals());

describe('fetchJson', () => {
  it('words an upstream error as "Upstream answered with status <n>: <url>"', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('slow down', { status: 429 })));
    await expect(fetchJson('https://mail.example/send', { timeoutMs: 1000 })).rejects.toThrow(
      'Upstream answered with status 429: https://mail.example/send',
    );
  });
  it('returns the JSON body on success', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{"id":"x"}', { status: 200 })));
    await expect(fetchJson('https://mail.example/send', { timeoutMs: 1000 })).resolves.toEqual({ id: 'x' });
  });
});
