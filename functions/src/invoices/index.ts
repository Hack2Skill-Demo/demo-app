import { TranslationServiceClient } from '@google-cloud/translate';
import { defineString } from 'firebase-functions/params';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { getStorage } from 'firebase-admin/storage';
import { GoogleAuth } from 'google-auth-library';
import { needsTranslation, parseLanguage, splitTranslations, textsToTranslate } from '../../../shared/invoice';
import type { InvoiceData } from '../../../pdf-renderer/src/types';
import type { OrderLine } from '../../../shared/types';
import { requireGrant } from '../lib/guards';
import { tracked, trackOutcome } from '../lib/track';
import { loadOwnOrder } from '../orders/model';

const translator = new TranslationServiceClient();
const auth = new GoogleAuth();

/** Base URL of the pdf-renderer Cloud Run service, set per deployment in functions/.env.<project>. */
const rendererUrl = defineString('PDF_RENDERER_URL', { default: '' });
const RENDER_DEADLINE_MS = 20_000;

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

/** The renderer is a private Cloud Run service: call it with an ID token for its own URL. */
async function renderWithService(invoice: InvoiceData): Promise<Buffer> {
  const url = rendererUrl.value().replace(/\/+$/, '');
  if (!url) throw new HttpsError('failed-precondition', 'The PDF renderer is not configured');
  const client = await auth.getIdTokenClient(url);
  const res = await client.request<ArrayBuffer>({
    url: `${url}/render`,
    method: 'POST',
    data: invoice,
    responseType: 'arraybuffer',
    timeout: RENDER_DEADLINE_MS,
  });
  return Buffer.from(res.data);
}

/**
 * Every rendered invoice is kept in the project's invoices bucket, `<project>-demo-invoices`. The runtime account may
 * only create objects there, never overwrite, so an invoice already stored (a second download) is left as it is.
 */
async function storeInvoice(orderId: string, language: string, pdf: Buffer): Promise<void> {
  const project = process.env.GCLOUD_PROJECT;
  if (!project) throw new Error('GCLOUD_PROJECT is not set');
  const file = getStorage().bucket(`${project}-demo-invoices`).file(`invoices/${orderId}-${language.toLowerCase()}.pdf`);
  try {
    await file.save(pdf, { contentType: 'application/pdf', preconditionOpts: { ifGenerationMatch: 0 } });
  } catch (err) {
    if ((err as { code?: number }).code !== 412) throw err; // 412: it is already there
  }
}

export const invoices = {
  /** Renders an order's invoice in the customer's language and returns the PDF as base64. */
  renderPdf: onCall(
    tracked<{ orderId?: unknown; language?: unknown }, { pdfBase64: string; filename: string }>('invoices-renderPdf', async (req) => {
      const uid = await requireGrant(req);
      const snap = await loadOwnOrder(req.data?.orderId, uid);
      const language = parseLanguage(req.data?.language ?? 'en');
      if (!language) throw new HttpsError('invalid-argument', 'language is not valid');
      const lines = snap.get('lines') as OrderLine[];

      const texts = textsToTranslate(lines);
      const { labels, names } = needsTranslation(language)
        ? splitTranslations(await translate(texts, language), lines.length)
        : splitTranslations(texts, lines.length);

      const pdf = await trackOutcome('pdf-renderer', () =>
        renderWithService({
          orderId: snap.id,
          createdAt: (snap.get('createdAt') as { toDate(): Date }).toDate().toISOString(),
          lines,
          subtotalCents: snap.get('subtotalCents') as number,
          discountCents: snap.get('discountCents') as number,
          giftWrapCents: (snap.get('giftWrapCents') as number | undefined) ?? 0,
          giftCardCents: (snap.get('giftCardCents') as number | undefined) ?? 0,
          totalCents: snap.get('totalCents') as number,
          labels,
          names,
        }),
      );
      await storeInvoice(snap.id, language, pdf);
      return { pdfBase64: pdf.toString('base64'), filename: `invoice-${snap.id}.pdf` };
    }),
  ),
};
