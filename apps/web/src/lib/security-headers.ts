/**
 * Response headers for every page. The policy restricts framing, plugins, the
 * document base URL, and form targets. It does not restrict scripts: a script
 * policy would need per-request nonces on every page.
 */
export function securityHeaders(isProduction: boolean): { key: string; value: string }[] {
  const headers = [
    {
      key: 'Content-Security-Policy',
      value: "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'",
    },
    // For browsers that predate frame-ancestors.
    { key: 'X-Frame-Options', value: 'DENY' },
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  ];
  if (isProduction) {
    // Production is served over HTTPS only. Subdomains are left to their own policy.
    headers.push({ key: 'Strict-Transport-Security', value: 'max-age=31536000' });
  }
  return headers;
}
