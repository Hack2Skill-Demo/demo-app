import { useEffect, useRef } from 'react';
import { starfishUrl } from './about';

/**
 * What the Demo Shop is, for a visitor who arrives here without having read Starfish's guide. A native modal dialog,
 * so focus, Escape and the backdrop behave as the browser's own.
 */
export function AboutDialog({ open, onClose, onOpenLab }: { open: boolean; onClose: () => void; onOpenLab: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog ref={ref} className="about" aria-labelledby="about-title" onClose={onClose}>
      <h2 id="about-title">What is the Demo Shop?</h2>
      <p>
        A made-up shop that exists so <strong>Starfish</strong>, an AI ops engineer built on Gemini, has a real app to
        watch. Nothing here is for sale: no real orders, no real payments.
      </p>
      <ul>
        <li>
          <strong>Synthetic customers</strong> shop here around the clock. When something fails for them, the error lands
          in this project&apos;s logs, the same way real customer traffic would.
        </li>
        <li>
          <strong>Starfish watches those logs.</strong> It judges how urgent each error is and, when a code change would
          help, drafts a fix with Gemini, checks it with this shop&apos;s own CI, reviews it, and can open a pull request.
        </li>
        <li>
          <strong>The Lab breaks one part of the shop on purpose.</strong> Each button says what will fail and where to
          see it. Press one, then watch the incident appear in Starfish.
        </li>
      </ul>
      <div className="actions">
        <a className="button primary" href={starfishUrl()} target="_blank" rel="noreferrer">
          Open Starfish ↗
        </a>
        <button onClick={onOpenLab}>Open the Lab</button>
        <button onClick={onClose}>Close</button>
      </div>
    </dialog>
  );
}
