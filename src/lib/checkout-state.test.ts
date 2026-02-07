import { describe, expect, it } from 'vitest';
import { parseCheckoutState } from './checkout-state';

function encodePayload(payload: object): string {
  const json = JSON.stringify(payload);
  const bytes = new TextEncoder().encode(json);
  let bin = '';
  bytes.forEach((b) => {
    bin += String.fromCharCode(b);
  });
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

describe('checkout-state', () => {
  it('parses a valid payload segment', () => {
    const token = `${encodePayload({
      payment_record_id: 'pay_1',
      invoice_id: 'inv_1',
      exp: Math.floor(Date.now() / 1000) + 300,
    })}.sig`;

    const parsed = parseCheckoutState(token);
    expect(parsed).not.toBeNull();
    expect(parsed?.payment_record_id).toBe('pay_1');
    expect(parsed?.invoice_id).toBe('inv_1');
  });

  it('rejects expired state', () => {
    const token = `${encodePayload({
      payment_record_id: 'pay_1',
      invoice_id: 'inv_1',
      exp: Math.floor(Date.now() / 1000) - 10,
    })}.sig`;

    expect(parseCheckoutState(token)).toBeNull();
  });
});
