import { z } from 'zod';

export const sortOptions = [
  { value: 'newest', label: 'Newest' },
  { value: 'price_asc', label: 'Price: low to high' },
  { value: 'price_desc', label: 'Price: high to low' },
] as const;

const MAX_PRICE_RUPEES = 10_000_000;

const emptyToUndefined = (value: unknown) => (value === '' ? undefined : value);
const priceInRupees = z
  .preprocess(emptyToUndefined, z.coerce.number().int().min(0).max(MAX_PRICE_RUPEES).optional())
  .catch(undefined);

// Values come from the address bar, so anything invalid falls back to "not set"
// instead of producing an error page.
const filtersSchema = z.object({
  q: z.string().trim().min(1).max(100).optional().catch(undefined),
  minPrice: priceInRupees,
  maxPrice: priceInRupees,
  sort: z.enum(['newest', 'price_asc', 'price_desc']).catch('newest'),
  page: z.coerce.number().int().min(1).max(10_000).catch(1),
});

/** Catalog filters as they appear in the page URL. Prices are whole rupees. */
export type CatalogFilters = z.infer<typeof filtersSchema>;

export type RawSearchParams = Record<string, string | string[] | undefined>;

export function parseCatalogFilters(searchParams: RawSearchParams): CatalogFilters {
  const firstValues = Object.fromEntries(
    Object.entries(searchParams).map(([name, value]) => [
      name,
      Array.isArray(value) ? value[0] : value,
    ]),
  );
  const filters = filtersSchema.parse(firstValues);

  const { minPrice, maxPrice } = filters;
  if (minPrice !== undefined && maxPrice !== undefined && minPrice > maxPrice) {
    return { ...filters, minPrice: maxPrice, maxPrice: minPrice };
  }
  return filters;
}

/** Builds a catalog URL. Changing any filter returns to the first page. */
export function catalogHref(
  basePath: string,
  filters: CatalogFilters,
  changes: Partial<CatalogFilters> = {},
): string {
  const next = { ...filters, page: 1, ...changes };
  const params = new URLSearchParams();

  if (next.q) params.set('q', next.q);
  if (next.minPrice !== undefined) params.set('minPrice', String(next.minPrice));
  if (next.maxPrice !== undefined) params.set('maxPrice', String(next.maxPrice));
  if (next.sort !== 'newest') params.set('sort', next.sort);
  if (next.page > 1) params.set('page', String(next.page));

  const query = params.toString();
  return query ? `${basePath}?${query}` : basePath;
}
