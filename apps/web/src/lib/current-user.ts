import { cache } from 'react';
import { z } from 'zod';
import { fetchAsCurrentUser } from './server-api';

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

/** The signed-in user, or null. The API is the only place the session is checked. */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const body = await fetchAsCurrentUser('/users/me');
  return body === null ? null : currentUserSchema.parse(body).data;
});
