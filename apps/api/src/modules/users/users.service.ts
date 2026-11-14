import type { Prisma } from '@cartforge/db';
import { prisma } from '../../lib/prisma.js';

/** The user fields that may leave the API. The password hash is never selected. */
export const publicUserSelect = {
  id: true,
  email: true,
  name: true,
  role: true,
  createdAt: true,
} satisfies Prisma.UserSelect;

export type PublicUser = Prisma.UserGetPayload<{ select: typeof publicUserSelect }>;

export async function listUsers(query: { page: number; pageSize: number }) {
  const [users, totalItems] = await prisma.$transaction([
    prisma.user.findMany({
      select: publicUserSelect,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.user.count(),
  ]);

  return {
    data: users,
    meta: {
      page: query.page,
      pageSize: query.pageSize,
      totalItems,
      totalPages: Math.ceil(totalItems / query.pageSize),
    },
  };
}
