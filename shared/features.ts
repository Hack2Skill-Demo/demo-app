/** The shop's features. The Lab page shows one health dot for each. */
export const FEATURES = [
  { id: 'access', label: 'Access code' },
  { id: 'catalog', label: 'Products' },
  { id: 'checkout', label: 'Checkout' },
  { id: 'recentOrders', label: 'Recent orders' },
  { id: 'searchOrders', label: 'Order search' },
  { id: 'orderDetails', label: 'Order details' },
  { id: 'cancelOrder', label: 'Cancel order' },
  { id: 'giftCards', label: 'Gift cards' },
  { id: 'billing', label: 'Card payment' },
  { id: 'paymentWebhook', label: 'Payment webhook' },
  { id: 'accounts', label: 'Sign-up' },
  { id: 'receipts', label: 'Receipt email' },
  { id: 'support', label: 'Support' },
  { id: 'invoices', label: 'Invoices' },
  { id: 'pdfRenderer', label: 'PDF renderer' },
  { id: 'nightlyExport', label: 'Nightly export' },
  { id: 'csvImport', label: 'CSV import' },
  { id: 'weeklyDigest', label: 'Weekly digest' },
  { id: 'dailyRollup', label: 'Daily rollup' },
  { id: 'backfill', label: 'Totals backfill' },
  { id: 'cacheWarmer', label: 'Cache warmer' },
  { id: 'lab', label: 'Lab' },
] as const;

export type FeatureId = (typeof FEATURES)[number]['id'];
