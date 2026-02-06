import { describe, expect, it } from 'vitest';
import { mapHttpError } from './errors';

describe('mapHttpError', () => {
  it('maps structured backend error_code first', () => {
    const result = mapHttpError(429, {
      ok: false,
      error_code: 'limit_exceeded',
      message: 'Limit reached',
      request_id: 'req_1',
    });

    expect(result.category).toBe('limit');
    expect(result.action).toBe('upgrade');
    expect(result.requestId).toBe('req_1');
  });

  it('maps legacy feature_not_available shape', () => {
    const result = mapHttpError(403, {
      error: 'feature_not_available',
      message: 'Upgrade required',
      request_id: 'req_2',
    });

    expect(result.category).toBe('limit');
    expect(result.action).toBe('upgrade');
    expect(result.requestId).toBe('req_2');
  });

  it('falls back to HTTP mapping when response body is unknown', () => {
    const result = mapHttpError(401, null);
    expect(result.category).toBe('auth');
    expect(result.action).toBe('sign-in');
  });
});
