import { setGlobalOptions } from 'firebase-functions/v2';

// The shop's functions run as demo-functions@<project>, a dedicated account for the shop. The trailing '@' makes
// the Firebase CLI append the project's domain; a bare name is rejected when it grants the account its secrets.
setGlobalOptions({ region: 'us-central1', maxInstances: 10, serviceAccount: 'demo-functions@' });

// Grouped exports deploy as `<group>-<name>`, e.g. `orders-createOrder`.
// functions/scripts/record-deploy.mjs reads the group names from the lines below.
export { access } from './access';
export { accounts } from './accounts';
export { admin } from './admin';
export { billing } from './billing';
export { catalog } from './catalog';
export { invoices } from './invoices';
export { misc } from './misc';
export { notifications } from './notifications';
export { orders } from './orders';
export { payments } from './payments';
export { reports } from './reports';
export { support } from './support';
