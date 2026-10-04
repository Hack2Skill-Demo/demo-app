import { describe, expect, it } from 'vitest';
import { INVOICE_LABELS as renderer } from '../../../pdf-renderer/src/types';
import { INVOICE_LABELS as shared } from '../../../shared/invoice';

describe('invoice labels', () => {
  it('match between the function that translates them and the renderer that draws them', () => {
    expect([...shared]).toEqual([...renderer]);
  });
});
