/** Minimal RFC 4180 reader: quoted fields, doubled quotes, CRLF or LF. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      if (row.some((f) => f !== '')) rows.push(row);
      row = [];
    } else field += ch;
  }
  row.push(field);
  if (row.some((f) => f !== '')) rows.push(row);
  return rows;
}

export interface ImportedProduct {
  id: string;
  name: string;
  priceCents: number;
}

export const MAX_IMPORT_ROWS = 400;
const ID = /^[a-z0-9][a-z0-9-]{0,39}$/;
const PRICE = /^\d{1,6}(\.\d{1,2})?$/;

/** Parse `id,name,price` rows. Any bad row rejects the whole file, so nothing half-imports. */
export function parseProductCsv(text: string): { products: ImportedProduct[]; errors: string[] } {
  const rows = parseCsv(text);
  const header = rows.shift()?.map((h) => h.trim().toLowerCase());
  if (!header || header.join(',') !== 'id,name,price') return { products: [], errors: ['The first row must be: id,name,price'] };
  if (rows.length === 0) return { products: [], errors: ['The file has no products'] };
  if (rows.length > MAX_IMPORT_ROWS) return { products: [], errors: [`At most ${MAX_IMPORT_ROWS} products per file`] };

  const products: ImportedProduct[] = [];
  const errors: string[] = [];
  const seen = new Set<string>();
  rows.forEach((cols, i) => {
    const line = i + 2;
    const [id = '', name = '', price = ''] = cols.map((c) => c.trim());
    if (cols.length !== 3) return void errors.push(`Line ${line}: expected 3 columns`);
    if (!ID.test(id)) return void errors.push(`Line ${line}: id must be lower-case letters, digits and dashes`);
    if (seen.has(id)) return void errors.push(`Line ${line}: id "${id}" appears twice`);
    if (!name || name.length > 80) return void errors.push(`Line ${line}: name must be 1 to 80 characters`);
    if (!PRICE.test(price)) return void errors.push(`Line ${line}: price must look like 12.50`);
    seen.add(id);
    products.push({ id, name, priceCents: Math.round(Number(price) * 100) });
  });
  return { products, errors };
}
