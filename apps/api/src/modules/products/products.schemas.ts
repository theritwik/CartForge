import { z } from 'zod';
import { wholeNumber } from '../../lib/query-params.js';

export const DEFAULT_PAGE_SIZE = 12;
export const MAX_PAGE_SIZE = 48;
const MAX_PAGE = 10_000;
const MAX_PAISE = 2_147_483_647;

export const slugSchema = z
  .string()
  .max(100)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Must be a slug');

export const productSortOptions = ['newest', 'price_asc', 'price_desc'] as const;

export const listProductsQuerySchema = z
  .object({
    q: z
      .string()
      .trim()
      .min(1)
      .max(100)
      // PostgreSQL rejects NUL bytes in text; no search needs control characters.
      .regex(/^\P{Cc}*$/u, 'Must not contain control characters')
      .optional(),
    category: slugSchema.optional(),
    minPricePaise: wholeNumber(0, MAX_PAISE).optional(),
    maxPricePaise: wholeNumber(0, MAX_PAISE).optional(),
    sort: z.enum(productSortOptions).default('newest'),
    page: wholeNumber(1, MAX_PAGE).default(1),
    pageSize: wholeNumber(1, MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
  })
  .refine(
    (query) =>
      query.minPricePaise === undefined ||
      query.maxPricePaise === undefined ||
      query.minPricePaise <= query.maxPricePaise,
    { path: ['minPricePaise'], message: 'Must not be greater than maxPricePaise' },
  );

export type ListProductsQuery = z.infer<typeof listProductsQuerySchema>;
