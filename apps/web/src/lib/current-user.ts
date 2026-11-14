import { cookies } from 'next/headers';
import { cache } from 'react';
import { z } from 'zod';
import { apiUrl } from './api-url';

const SESSION_COOKIE_NAMES = ['__Host-cartforge_session', 'cartforge_session'];

const currentUserSchema = z.object({
  data: z.object({
    id: z.string(),
    name: z.string(),
    email: z.string(),
    role: z.enum(['CUSTOMER', 'ADMIN']),
    createdAt: z.coerce.date(),
  }),
});

export type CurrentUser = z.infer<typeof currentUserSchema>['data'];

/**
 * The signed-in user, or null. The browser's session cookie is forwarded to the
 * API, which is the only place the session is checked. The web app never reads
 * or stores the token itself.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const cookieStore = await cookies();
  const sessionCookie = SESSION_COOKIE_NAMES.map((name) => cookieStore.get(name)).find(Boolean);
  if (!sessionCookie) {
    return null;
  }

  const response = await fetch(apiUrl('/users/me'), {
    headers: { cookie: `${sessionCookie.name}=${sessionCookie.value}` },
    cache: 'no-store',
  });
  if (response.status === 401) {
    return null;
  }
  if (!response.ok) {
    throw new Error(`The API responded with status ${response.status} for the current user.`);
  }
  return currentUserSchema.parse(await response.json()).data;
});
