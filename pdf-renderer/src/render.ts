import { PDFDocument, StandardFonts, rgb, type PDFPage } from 'pdf-lib';
import { INVOICE_LABELS, type InvoiceData } from './types';

/** The standard PDF fonts only draw Latin text; swap anything else for "?" rather than fail the whole invoice. */
export function toDrawable(text: string, supported: ReadonlySet<number>): string {
  return Array.from(text, (ch) => (supported.has(ch.codePointAt(0)!) ? ch : '?')).join('');
}

/** Check a request body before rendering: the service is reachable by anything allowed to invoke it. */
export function parseInvoiceData(raw: unknown): InvoiceData {
  const d = raw as Partial<InvoiceData> | null;
  const bad = (why: string) => new Error(`Invalid invoice: ${why}`);
  if (!d || typeof d !== 'object') throw bad('not an object');
  if (typeof d.orderId !== 'string' || typeof d.createdAt !== 'string' || Number.isNaN(Date.parse(d.createdAt))) throw bad('orderId or createdAt');
  if (!Array.isArray(d.lines) || d.lines.length === 0 || d.lines.length > 50) throw bad('lines');
  if (!Array.isArray(d.names) || d.names.length !== d.lines.length) throw bad('names');
  for (const k of ['subtotalCents', 'discountCents', 'giftWrapCents', 'giftCardCents', 'totalCents'] as const) {
    if (!Number.isInteger(d[k])) throw bad(k);
  }
  if (!d.labels || INVOICE_LABELS.some((l) => typeof d.labels![l] !== 'string')) throw bad('labels');
  return d as InvoiceData;
}

const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;

const PAGE_SIZE: [number, number] = [595, 842];
const ROWS_PER_PAGE = 12;

export async function renderInvoicePdf(data: InvoiceData): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const pageCount = Math.floor(data.lines.length / ROWS_PER_PAGE);
  const pages = [pdf.addPage(PAGE_SIZE)];
  for (let p = 1; p < pageCount; p++) pages.push(pdf.addPage(PAGE_SIZE));
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const supported = new Set(font.getCharacterSet());
  const draw = (on: PDFPage, text: string, x: number, y: number, size = 11, f = font) =>
    on.drawText(toDrawable(text, supported), { x, y, size, font: f, color: rgb(0.1, 0.1, 0.1) });
  const right = (on: PDFPage, text: string, x: number, y: number, f = font) =>
    draw(on, text, x - f.widthOfTextAtSize(toDrawable(text, supported), 11), y, 11, f);

  const { labels } = data;
  const first = pages[0]!;
  let y = 780;
  draw(first, labels.Invoice, 50, y, 24, bold);
  y -= 30;
  draw(first, `${labels.Order}: ${data.orderId}`, 50, y);
  y -= 16;
  draw(first, `${labels.Date}: ${data.createdAt.slice(0, 10)}`, 50, y);
  y -= 40;
  draw(first, labels.Item, 50, y, 11, bold);
  right(first, labels.Qty, 380, y, bold);
  right(first, labels.Price, 545, y, bold);
  y -= 8;
  first.drawLine({ start: { x: 50, y }, end: { x: 545, y }, thickness: 0.5 });
  for (const [i, line] of data.lines.entries()) {
    if (i > 0 && i % ROWS_PER_PAGE === 0) y = 780;
    y -= 18;
    const on = pages[Math.floor(i / ROWS_PER_PAGE)]!;
    draw(on, data.names[i] ?? line.name, 50, y);
    right(on, String(line.qty), 380, y);
    right(on, money(line.priceCents * line.qty), 545, y);
  }
  const last = pages[pages.length - 1]!;
  y -= 30;
  right(last, `${labels.Subtotal}: ${money(data.subtotalCents)}`, 545, y);
  const extras: [string, number][] = [
    [labels.Discount, -data.discountCents],
    ['Gift wrap', data.giftWrapCents],
    ['Gift card', -data.giftCardCents],
  ];
  for (const [label, cents] of extras) {
    if (cents === 0) continue;
    y -= 16;
    right(last, `${label}: ${cents < 0 ? '-' : ''}${money(Math.abs(cents))}`, 545, y);
  }
  y -= 20;
  right(last, `${labels.Total}: ${money(data.totalCents)}`, 545, y, bold);
  return pdf.save();
}
