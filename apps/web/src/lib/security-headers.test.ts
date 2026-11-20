import { describe, expect, it } from 'vitest';
import { securityHeaders } from './security-headers';

const asRecord = (isProduction: boolean) =>
  Object.fromEntries(securityHeaders(isProduction).map(({ key, value }) => [key, value]));

describe('securityHeaders', () => {
  it('forbids framing by any site', () => {
    const headers = asRecord(false);

    expect(headers['Content-Security-Policy']).toContain("frame-ancestors 'none'");
    expect(headers['X-Frame-Options']).toBe('DENY');
  });

  it('limits form targets and the base URL to this site and disables plugins', () => {
    const policy = asRecord(false)['Content-Security-Policy'];

    expect(policy).toContain("form-action 'self'");
    expect(policy).toContain("base-uri 'self'");
    expect(policy).toContain("object-src 'none'");
  });

  it('stops content sniffing and limits the referrer sent to other sites', () => {
    const headers = asRecord(false);

    expect(headers['X-Content-Type-Options']).toBe('nosniff');
    expect(headers['Referrer-Policy']).toBe('strict-origin-when-cross-origin');
  });

  it('requires HTTPS only in production', () => {
    expect(asRecord(false)['Strict-Transport-Security']).toBeUndefined();
    expect(asRecord(true)['Strict-Transport-Security']).toBe('max-age=31536000');
  });
});
