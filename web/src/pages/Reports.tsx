import { doc, onSnapshot } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import type { ExportStatus } from '../../../shared/types';
import { db } from '../firebase';

export function Reports() {
  const [last, setLast] = useState<ExportStatus | null | undefined>(undefined);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(
    () =>
      onSnapshot(
        doc(db, 'exports', 'last'),
        (snap) =>
          setLast(
            snap.exists()
              ? {
                  status: snap.get('status'),
                  forDate: snap.get('forDate'),
                  orderCount: snap.get('orderCount'),
                  error: snap.get('error') ?? null,
                  finishedAtMs: (snap.get('finishedAt') as { toMillis(): number }).toMillis(),
                }
              : null,
          ),
        () => setLoadFailed(true),
      ),
    [],
  );

  if (loadFailed) return <p role="alert" className="error">Could not load the export status.</p>;
  if (last === undefined) return <p>Loading…</p>;

  return (
    <section>
      <h2>Reports</h2>
      <h3>Nightly export</h3>
      {last === null && <p>No export has run yet.</p>}
      {last?.status === 'ready' && (
        <p>
          Ready: {last.orderCount} orders for {last.forDate}, finished {new Date(last.finishedAtMs).toLocaleString()}.
        </p>
      )}
      {last?.status === 'failed' && (
        <p role="alert" className="error">
          Failed for {last.forDate} at {new Date(last.finishedAtMs).toLocaleString()}: {last.error}
        </p>
      )}
    </section>
  );
}
