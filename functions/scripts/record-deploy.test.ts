import { describe, expect, it } from 'vitest';
// @ts-expect-error plain ESM script, no types
import { groupsFromIndex, pickRevisions } from './record-deploy.mjs';

describe('record-deploy', () => {
  it('reads the function groups from index.ts', () => {
    const src = "export { access } from './access';\n// export { nope } from './x';\nexport { orders } from './orders';\n";
    expect(groupsFromIndex(src)).toEqual(['access', 'orders']);
  });

  it('keeps only this codebase\'s revisions', () => {
    const services = [
      { name: 'projects/p/locations/us-central1/services/orders-createorder', latestReadyRevision: 'projects/p/locations/us-central1/services/orders-createorder/revisions/orders-createorder-00007-abc' },
      { name: 'projects/p/locations/us-central1/services/starfish-ingest', latestReadyRevision: 'x/revisions/starfish-ingest-00002-zzz' },
      { name: 'projects/p/locations/us-central1/services/reports-nightlyexport' },
    ];
    expect(pickRevisions(services, ['orders', 'reports'])).toEqual({ 'orders-createorder': 'orders-createorder-00007-abc' });
  });
});
