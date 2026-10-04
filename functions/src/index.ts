import { setGlobalOptions } from 'firebase-functions/v2';

setGlobalOptions({ region: 'us-central1', maxInstances: 10 });

// Grouped exports deploy as `<group>-<name>`, e.g. `orders-createOrder`.
// functions/scripts/record-deploy.mjs reads the group names from the lines below.
export { access } from './access';
export { catalog } from './catalog';
export { invoices } from './invoices';
export { lab } from './lab';
export { orders } from './orders';
export { reports } from './reports';
