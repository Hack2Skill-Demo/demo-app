import { createServer } from 'node:http';
import { parseInvoiceData, renderInvoicePdf } from './render';

const MAX_BODY_BYTES = 256 * 1024;

async function readBody(req: import('node:http').IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY_BYTES) throw new Error('Body too large');
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString('utf8');
}

const server = createServer((req, res) => {
  void (async () => {
    if (req.method === 'GET' && req.url === '/healthz') return void res.writeHead(200).end('ok');
    if (req.method !== 'POST' || req.url !== '/render') return void res.writeHead(404).end();
    let data;
    try {
      data = parseInvoiceData(JSON.parse(await readBody(req)));
    } catch (err) {
      return void res.writeHead(400, { 'content-type': 'text/plain' }).end(err instanceof Error ? err.message : 'Bad request');
    }
    try {
      const pdf = await renderInvoicePdf(data);
      res.writeHead(200, { 'content-type': 'application/pdf' }).end(Buffer.from(pdf));
    } catch (err) {
      console.error('render failed', err);
      res.writeHead(500, { 'content-type': 'text/plain' }).end('Render failed');
    }
  })();
});

server.listen(Number(process.env.PORT ?? 8080));
