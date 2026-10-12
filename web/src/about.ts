/**
 * The "What is this shop?" dialog: where Starfish lives, and whether this browser has seen the dialog. A judge may open
 * the shop without having read Starfish's own guide, so the shop says what it is and links back.
 */

/** Starfish's public operator UI: the deployment that watches this shop. */
export const DEFAULT_STARFISH_URL = 'https://ocean-starfish.web.app';

/** The Starfish link: `VITE_STARFISH_URL` when it is an https URL (a local build pointing elsewhere), else the demo's. */
export function starfishUrl(configured: string | undefined = import.meta.env.VITE_STARFISH_URL as string | undefined): string {
  if (!configured) return DEFAULT_STARFISH_URL;
  try {
    return new URL(configured).protocol === 'https:' ? configured : DEFAULT_STARFISH_URL;
  } catch {
    return DEFAULT_STARFISH_URL;
  }
}

const SEEN_KEY = 'demoShop.aboutSeen';

/** Storage this browser may refuse (private mode, blocked site data); a test passes its own. */
type Store = Pick<Storage, 'getItem' | 'setItem'>;
const browserStore = (): Store => localStorage;

/** Whether the dialog opens by itself: once per browser. Unreadable storage means it opens, which is the safe side. */
export function shouldAutoOpenAbout(store: () => Store = browserStore): boolean {
  try {
    return store().getItem(SEEN_KEY) !== '1';
  } catch {
    return true;
  }
}

export function markAboutSeen(store: () => Store = browserStore): void {
  try {
    store().setItem(SEEN_KEY, '1');
  } catch {
    // Blocked storage: the dialog just opens again next visit.
  }
}
