import { setGlobalOptions } from 'firebase-functions/v2';

// The shop's functions run as demo-functions@<project>, a dedicated account for the shop. This must be the full
// email: the Firebase CLI grants the account its secrets using the value as written, and Secret Manager rejects
// both a bare name and the `name@` shorthand. The CLI sets GCLOUD_PROJECT when it loads this file for a deploy.
setGlobalOptions({
  region: 'us-central1',
  maxInstances: 10,
  serviceAccount: `demo-functions@${process.env.GCLOUD_PROJECT}.iam.gserviceaccount.com`,
});

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
