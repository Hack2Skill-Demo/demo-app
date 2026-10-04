import type { OrderLine } from './types';

export const INVOICE_LABELS = ['Invoice', 'Order', 'Date', 'Item', 'Qty', 'Price', 'Subtotal', 'Discount', 'Total'] as const;
export type InvoiceLabel = (typeof INVOICE_LABELS)[number];

const LANGUAGE = /^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})?$/;

/** A language tag from the browser, or null when it is not one. */
export function parseLanguage(raw: unknown): string | null {
  return typeof raw === 'string' && LANGUAGE.test(raw) ? raw : null;
}

/** Order lines are stored in English, so an English customer needs no translation. */
export function needsTranslation(language: string): boolean {
  return !/^en(-|$)/i.test(language);
}

/** Everything the invoice shows that is words rather than numbers: labels first, then product names. */
export function textsToTranslate(lines: readonly OrderLine[]): string[] {
  return [...INVOICE_LABELS, ...lines.map((l) => l.name)];
}

export function splitTranslations(
  translated: readonly string[],
  lineCount: number,
): { labels: Record<InvoiceLabel, string>; names: string[] } {
  if (translated.length !== INVOICE_LABELS.length + lineCount) throw new Error('Translation returned the wrong number of texts');
  const labels = Object.fromEntries(INVOICE_LABELS.map((l, i) => [l, translated[i]!])) as Record<InvoiceLabel, string>;
  return { labels, names: translated.slice(INVOICE_LABELS.length) };
}

/** The standard PDF fonts only draw Latin text; swap anything else for "?" rather than fail the whole invoice. */
export function toDrawable(text: string, supported: ReadonlySet<number>): string {
  return Array.from(text, (ch) => (supported.has(ch.codePointAt(0)!) ? ch : '?')).join('');
}
