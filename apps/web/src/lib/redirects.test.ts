import { describe, expect, it } from 'vitest';
import { safeRedirectPath } from './redirects';

describe('safeRedirectPath', () => {
  it('accepts a path on this site, including its query string', () => {
    expect(safeRedirectPath('/products?q=steel')).toBe('/products?q=steel');
  });

  it.each([
    undefined,
    '',
    'account',
    'https://evil.example/',
    '//evil.example',
    '/\\evil.example',
    'javascript:alert(1)',
    '/\t/evil.example',
    '/\n/evil.example',
    ['/a', '/b'],
  ])('falls back to the account page for %j', (value) => {
    expect(safeRedirectPath(value)).toBe('/account');
  });
});
