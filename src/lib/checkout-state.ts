export interface CheckoutStatePayload {
  payment_record_id: string;
  invoice_id: string;
  exp: number;
}

function decodeBase64Url(segment: string): string {
  const b64 = segment.replace(/-/g, '+').replace(/_/g, '/');
  const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
  const decoded = atob(padded);
  const bytes = Uint8Array.from(decoded, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function parseCheckoutState(token: string | null | undefined): CheckoutStatePayload | null {
  if (!token) return null;
  const [payloadSegment] = token.split('.');
  if (!payloadSegment) return null;

  try {
    const parsed = JSON.parse(decodeBase64Url(payloadSegment)) as CheckoutStatePayload;
    if (!parsed.payment_record_id || !parsed.invoice_id || !parsed.exp) return null;
    if (Math.floor(Date.now() / 1000) >= parsed.exp) return null;
    return parsed;
  } catch {
    return null;
  }
}

export const CHECKOUT_STATE_STORAGE_KEY = 'zohal_checkout_state';
