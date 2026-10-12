import { describe, expect, it } from 'vitest';
import { DEFAULT_STARFISH_URL, markAboutSeen, shouldAutoOpenAbout, starfishUrl } from './about';

const memory = () => {
  const items = new Map<string, string>();
  const store = { getItem: (k: string) => items.get(k) ?? null, setItem: (k: string, v: string) => void items.set(k, v) };
  return () => store;
};
const blocked = () => {
  throw new Error('SecurityError');
};

describe('starfishUrl', () => {
  it('is the demo deployment when nothing is configured', () => {
    expect(starfishUrl(undefined)).toBe(DEFAULT_STARFISH_URL);
    expect(starfishUrl('')).toBe(DEFAULT_STARFISH_URL);
  });

  it('takes a configured https URL', () => {
    expect(starfishUrl('https://my-starfish.web.app')).toBe('https://my-starfish.web.app');
  });

  it('ignores anything that is not an https URL', () => {
    expect(starfishUrl('javascript:alert(1)')).toBe(DEFAULT_STARFISH_URL);
    expect(starfishUrl('http://insecure.example')).toBe(DEFAULT_STARFISH_URL);
    expect(starfishUrl('not a url')).toBe(DEFAULT_STARFISH_URL);
  });
});

describe('the dialog opens by itself once per browser', () => {
  it('opens on the first visit and not after it was seen', () => {
    const store = memory();
    expect(shouldAutoOpenAbout(store)).toBe(true);
    markAboutSeen(store);
    expect(shouldAutoOpenAbout(store)).toBe(false);
  });

  it('opens, and never throws, when storage is blocked', () => {
    expect(shouldAutoOpenAbout(blocked)).toBe(true);
    expect(() => markAboutSeen(blocked)).not.toThrow();
  });
});
