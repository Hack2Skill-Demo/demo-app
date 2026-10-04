/** The shop's features. The Lab page shows one health dot for each. */
export const FEATURES = [
  { id: 'access', label: 'Access code' },
  { id: 'catalog', label: 'Products' },
  { id: 'checkout', label: 'Checkout' },
  { id: 'recentOrders', label: 'Recent orders' },
  { id: 'invoices', label: 'Invoices' },
  { id: 'nightlyExport', label: 'Nightly export' },
  { id: 'lab', label: 'Lab' },
] as const;

export type FeatureId = (typeof FEATURES)[number]['id'];
