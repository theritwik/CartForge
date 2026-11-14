import { cookies } from 'next/headers';
import { apiUrl } from './api-url';

const SESSION_COOKIE_NAMES = ['__Host-cartforge_session', 'cartforge_session'];

/**
 * Calls the API from a Server Component on behalf of the visitor by forwarding
 * their session cookie. Returns null when the visitor has no session cookie or
 * the API no longer accepts it. The web app never inspects the token itself.
 */
export async function fetchAsCurrentUser(path: string): Promise<unknown> {
  const cookieStore = await cookies();
  const sessionCookie = SESSION_COOKIE_NAMES.map((name) => cookieStore.get(name)).find(Boolean);
  if (!sessionCookie) {
    return null;
  }

  const response = await fetch(apiUrl(path), {
    headers: { cookie: `${sessionCookie.name}=${sessionCookie.value}` },
    cache: 'no-store',
  });
  if (response.status === 401) {
    return null;
  }
  if (!response.ok) {
    throw new Error(`The API responded with status ${response.status} for ${path}.`);
  }
  return response.json();
}
