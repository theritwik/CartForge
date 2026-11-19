import { z } from 'zod';
import { orderStatusSchema } from './orders';
import type { RawSearchParams } from './catalog-filters';

const page = z.coerce.number().int().min(1).max(10_000).catch(1);
const optionalText = z.string().trim().min(1).max(100).optional().catch(undefined);

function firstValues(searchParams: RawSearchParams): Record<string, string | undefined> {
  return Object.fromEntries(
    Object.entries(searchParams).map(([name, value]) => [
      name,
      Array.isArray(value) ? value[0] : value,
    ]),
  );
}

// Filters come from the address bar, so invalid values fall back to "not set"
// instead of producing an error page.
const productFiltersSchema = z.object({
  q: optionalText,
  status: z.enum(['DRAFT', 'ACTIVE', 'ARCHIVED']).optional().catch(undefined),
  categoryId: z.uuid().optional().catch(undefined),
  lowStock: z.literal('true').optional().catch(undefined),
  page,
});

const orderFiltersSchema = z.object({
  status: orderStatusSchema.optional().catch(undefined),
  reference: z
    .string()
    .trim()
    .regex(/^#?[0-9a-fA-F-]{4,36}$/)
    .optional()
    .catch(undefined),
  email: z.string().trim().min(3).max(254).optional().catch(undefined),
  page,
});

export type ProductFilters = z.infer<typeof productFiltersSchema>;
export type OrderFilters = z.infer<typeof orderFiltersSchema>;

export function parseProductFilters(searchParams: RawSearchParams): ProductFilters {
  return productFiltersSchema.parse(firstValues(searchParams));
}

export function parseOrderFilters(searchParams: RawSearchParams): OrderFilters {
  return orderFiltersSchema.parse(firstValues(searchParams));
}

/** The filters as a query string, leaving out anything not set. */
export function toQuery(filters: Record<string, string | number | undefined>): URLSearchParams {
  const query = new URLSearchParams();
  for (const [name, value] of Object.entries(filters)) {
    if (value !== undefined && !(name === 'page' && value === 1)) {
      query.set(name, String(value));
    }
  }
  return query;
}
