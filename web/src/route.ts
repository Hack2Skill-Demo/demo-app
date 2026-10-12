/** The shop's pages. There is no router: the page is state, and a link can name one with a fragment (`/#lab`). */
export const PAGES = ['shop', 'orders', 'reports', 'support', 'lab'] as const;
export type Page = (typeof PAGES)[number];

/** The page a fragment names, so Starfish's demo can link straight to the Lab; anything else opens the shop. */
export function pageFromHash(hash: string): Page {
  const name = hash.replace(/^#/, '').toLowerCase();
  return (PAGES as readonly string[]).includes(name) ? (name as Page) : 'shop';
}
