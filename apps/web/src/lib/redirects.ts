const DEFAULT_PATH = '/account';

/**
 * Where to send someone after they sign in. Only paths on this site are
 * accepted, so a crafted link cannot bounce a user to another site.
 */
export function safeRedirectPath(value: string | string[] | undefined): string {
  if (typeof value !== 'string' || !value.startsWith('/')) {
    return DEFAULT_PATH;
  }
  // "//host" and "/\\host" are treated by browsers as another site. Browsers also drop
  // tabs and newlines from URLs, which could turn "/<tab>/host" into "//host".
  if (value.startsWith('//') || value.includes('\\') || /[\u0000-\u001f\u007f]/.test(value)) {
    return DEFAULT_PATH;
  }
  return value;
}
