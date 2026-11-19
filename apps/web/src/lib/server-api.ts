import { cookies } from 'next/headers';
import { apiUrl } from './api-url';

const SESSION_COOKIE_NAMES = ['__Host-cartforge_session', 'cartforge_session'];

export type ApiReply =
  | { status: 'ok'; body: unknown }
  /** The visitor has no session cookie, or the API no longer accepts it. */
  | { status: 'unauthenticated' }
  /** Signed in, but not allowed: an admin endpoint called by a customer. */
  | { status: 'forbidden' }
  | { status: 'not_found' };

/**
 * Calls the API from a Server Component on behalf of the visitor by forwarding
 * their session cookie. The web app never inspects the token itself.
 */
export async function fetchAsCurrentUser(path: string): Promise<ApiReply> {
  const cookieStore = await cookies();
  const sessionCookie = SESSION_COOKIE_NAMES.map((name) => cookieStore.get(name)).find(Boolean);
  if (!sessionCookie) {
    return { status: 'unauthenticated' };
  }

  const response = await fetch(apiUrl(path), {
    headers: { cookie: `${sessionCookie.name}=${sessionCookie.value}` },
    cache: 'no-store',
  });
  if (response.status === 401) {
    return { status: 'unauthenticated' };
  }
  if (response.status === 403) {
    return { status: 'forbidden' };
  }
  if (response.status === 404) {
    return { status: 'not_found' };
  }
  if (!response.ok) {
    throw new Error(`The API responded with status ${response.status} for ${path}.`);
  }
  return { status: 'ok', body: await response.json() };
}
