import { describe, expect, it } from 'vitest';
import { parseTicket } from './index';

describe('parseTicket', () => {
  it('trims and accepts a good ticket', () => {
    expect(parseTicket({ email: ' a@b.co ', subject: ' Help ', message: ' Where is my order? ' })).toEqual({
      email: 'a@b.co',
      subject: 'Help',
      message: 'Where is my order?',
    });
  });
  it.each([
    [{ email: 'nope', subject: 's', message: 'm' }],
    [{ email: 'a@b.co', subject: '', message: 'm' }],
    [{ email: 'a@b.co', subject: 'x'.repeat(121), message: 'm' }],
    [{ email: 'a@b.co', subject: 's', message: 'm'.repeat(2001) }],
    [undefined],
  ])('rejects %j', (bad) => {
    expect(() => parseTicket(bad)).toThrow();
  });
});
