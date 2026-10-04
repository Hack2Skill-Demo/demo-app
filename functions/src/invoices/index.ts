import { TranslationServiceClient } from '@google-cloud/translate';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import {
  needsTranslation,
  parseLanguage,
  splitTranslations,
  textsToTranslate,
  toDrawable,
  type InvoiceLabel,
} from '../../../shared/invoice';
import type { OrderLine } from '../../../shared/types';
import { db } from '../lib/firebase';
import { requireGrant } from '../lib/guards';
import { tracked } from '../lib/track';

const translator = new TranslationServiceClient();

/** Translate the invoice's words with the Cloud Translation API. A failure here fails the invoice. */
async function translate(texts: string[], language: string): Promise<string[]> {
  const project = process.env.GCLOUD_PROJECT;
  if (!project) throw new Error('GCLOUD_PROJECT is not set');
  const [res] = await translator.translateText({
    parent: `projects/${project}/locations/global`,
    contents: texts,
    mimeType: 'text/plain',
    sourceLanguageCode: 'en',
    targetLanguageCode: language,
  });
  return (res.translations ?? []).map((t) => t.translatedText ?? '');
}

interface InvoiceData {
  orderId: string;
  createdAt: Date;
  lines: OrderLine[];
  subtotalCents: number;
  discountCents: number;
  totalCents: number;
  labels: Record<InvoiceLabel, string>;
  names: string[];
}

const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;

export async function renderInvoicePdf(data: InvoiceData): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595, 842]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const supported = new Set(font.getCharacterSet());
  const draw = (text: string, x: number, y: number, size = 11, f = font) =>
    page.drawText(toDrawable(text, supported), { x, y, size, font: f, color: rgb(0.1, 0.1, 0.1) });
  const right = (text: string, x: number, y: number, f = font) => draw(text, x - f.widthOfTextAtSize(toDrawable(text, supported), 11), y, 11, f);

  let y = 780;
  draw(data.labels.Invoice, 50, y, 24, bold);
  y -= 30;
  draw(`${data.labels.Order}: ${data.orderId}`, 50, y);
  y -= 16;
  draw(`${data.labels.Date}: ${data.createdAt.toISOString().slice(0, 10)}`, 50, y);
  y -= 40;
  draw(data.labels.Item, 50, y, 11, bold);
  right(data.labels.Qty, 380, y, bold);
  right(data.labels.Price, 545, y, bold);
  y -= 8;
  page.drawLine({ start: { x: 50, y }, end: { x: 545, y }, thickness: 0.5 });
  for (const [i, line] of data.lines.entries()) {
    y -= 18;
    draw(data.names[i] ?? line.name, 50, y);
    right(String(line.qty), 380, y);
    right(money(line.priceCents * line.qty), 545, y);
  }
  y -= 30;
  right(`${data.labels.Subtotal}: ${money(data.subtotalCents)}`, 545, y);
  if (data.discountCents > 0) {
    y -= 16;
    right(`${data.labels.Discount}: -${money(data.discountCents)}`, 545, y);
  }
  y -= 20;
  right(`${data.labels.Total}: ${money(data.totalCents)}`, 545, y, bold);
  return pdf.save();
}

export const invoices = {
  /** Renders an order's invoice in the customer's language and returns the PDF as base64. */
  renderPdf: onCall(
    tracked<{ orderId?: unknown; language?: unknown }, { pdfBase64: string; filename: string }>('invoices', async (req) => {
      const uid = await requireGrant(req);
      const { orderId } = req.data ?? {};
      if (typeof orderId !== 'string' || !orderId || orderId.includes('/')) throw new HttpsError('invalid-argument', 'orderId is required');
      const language = parseLanguage(req.data?.language ?? 'en');
      if (!language) throw new HttpsError('invalid-argument', 'language is not valid');

      const snap = await db.doc(`orders/${orderId}`).get();
      // Someone else's order looks the same as a missing one.
      if (!snap.exists || snap.get('uid') !== uid) throw new HttpsError('not-found', 'No such order');
      const lines = snap.get('lines') as OrderLine[];

      const texts = textsToTranslate(lines);
      const { labels, names } = needsTranslation(language)
        ? splitTranslations(await translate(texts, language), lines.length)
        : splitTranslations(texts, lines.length);

      const pdf = await renderInvoicePdf({
        orderId,
        createdAt: (snap.get('createdAt') as { toDate(): Date }).toDate(),
        lines,
        subtotalCents: snap.get('subtotalCents') as number,
        discountCents: snap.get('discountCents') as number,
        totalCents: snap.get('totalCents') as number,
        labels,
        names,
      });
      return { pdfBase64: Buffer.from(pdf).toString('base64'), filename: `invoice-${orderId}.pdf` };
    }),
  ),
};

