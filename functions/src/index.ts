import { setGlobalOptions } from 'firebase-functions/v2';

setGlobalOptions({ region: 'us-central1', maxInstances: 10 });

// Grouped exports deploy as `<group>-<name>`, e.g. `orders-createOrder`.
export { access } from './access';
export { catalog } from './catalog';
export { lab } from './lab';
export { orders } from './orders';
