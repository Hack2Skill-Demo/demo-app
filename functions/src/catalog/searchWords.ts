/** What the shop's product search sends: the text in the search box. */
export interface ProductSearch {
  query: string;
}

/**
 * The words of a product search, lower-cased, in the order typed: "  Enamel MUG " gives ["enamel", "mug"].
 * Null when there is nothing to search for, so the caller lists the whole catalog.
 */
export function searchWords(search: ProductSearch): string[] | null {
  const words = search.query.trim().toLowerCase().split(/\s+/).filter((word) => word !== '');
  return words.length > 0 ? words : null;
}
