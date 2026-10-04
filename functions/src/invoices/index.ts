import { TranslationServiceClient } from '@google-cloud/translate';
import { defineString } from 'firebase-functions/params';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
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

export const invoices = {
  /** Renders an order's invoice in the customer's language and returns the PDF as base64. */
  renderPdf: onCall(
    tracked<{ orderId?: unknown; language?: unknown }, { pdfBase64: string; filename: string }>('invoices', async (req) => {
      const uid = await requireGrant(req);
      const snap = await loadOwnOrder(req.data?.orderId, uid);
      const language = parseLanguage(req.data?.language ?? 'en');
      if (!language) throw new HttpsError('invalid-argument', 'language is not valid');
      const lines = snap.get('lines') as OrderLine[];

      const texts = textsToTranslate(lines);
      const { labels, names } = needsTranslation(language)
        ? splitTranslations(await translate(texts, language), lines.length)
        : splitTranslations(texts, lines.length);

      const pdf = await trackOutcome('pdfRenderer', () =>
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
      return { pdfBase64: pdf.toString('base64'), filename: `invoice-${snap.id}.pdf` };
    }),
  ),
};
