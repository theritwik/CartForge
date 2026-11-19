import { Prisma } from '@cartforge/db';

/**
 * The column a unique-constraint violation was about, read from the constraint
 * name (for example "products_slug_key" gives "slug"), or null for any other error.
 */
export function uniqueViolationField(error: unknown, fields: readonly string[]): string | null {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') {
    return null;
  }
  const detail = JSON.stringify(error.meta ?? {});
  return fields.find((field) => detail.includes(`_${field}_key`)) ?? fields[0] ?? null;
}
