import { cache } from 'react';
import { z } from 'zod';
import { apiUrl } from './api-url';

const imageSchema = z.object({ url: z.string(), altText: z.string() });

const productBaseSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  pricePaise: z.number().int(),
  category: z.object({ name: z.string(), slug: z.string() }),
  availableQuantity: z.number().int(),
  inStock: z.boolean(),
});

const productSummarySchema = productBaseSchema.extend({ image: imageSchema.nullable() });

const productListSchema = z.object({
  data: z.array(productSummarySchema),
  meta: z.object({
    page: z.number().int(),
    pageSize: z.number().int(),
    totalItems: z.number().int(),
    totalPages: z.number().int(),
  }),
});

const productDetailSchema = z.object({
  data: productBaseSchema.extend({ description: z.string(), images: z.array(imageSchema) }),
});

const categoryListSchema = z.object({
  data: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      slug: z.string(),
      productCount: z.number().int(),
    }),
  ),
});

export type ProductImage = z.infer<typeof imageSchema>;
export type ProductSummary = z.infer<typeof productSummarySchema>;
export type ProductList = z.infer<typeof productListSchema>;
export type ProductDetail = z.infer<typeof productDetailSchema>['data'];
export type Category = z.infer<typeof categoryListSchema>['data'][number];

export interface ProductListQuery {
  q?: string | undefined;
  category?: string | undefined;
  minPricePaise?: number | undefined;
  maxPricePaise?: number | undefined;
  sort?: string | undefined;
  page?: number | undefined;
  pageSize?: number | undefined;
}

/** Fetches from the API server-to-server. Returns null for a 404 and throws for other failures. */
async function fetchFromApi(path: string, query: object = {}): Promise<unknown> {
  const url = apiUrl(path);
  for (const [name, value] of Object.entries(query)) {
    if (value !== undefined) {
      url.searchParams.set(name, String(value));
    }
  }

  const response = await fetch(url, { cache: 'no-store' });
  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    throw new Error(`The catalog API responded with status ${response.status} for ${path}.`);
  }
  return response.json();
}

export async function getProducts(query: ProductListQuery): Promise<ProductList> {
  return productListSchema.parse(await fetchFromApi('/products', query));
}

export const getProduct = cache(async (slug: string): Promise<ProductDetail | null> => {
  const body = await fetchFromApi(`/products/${encodeURIComponent(slug)}`);
  return body === null ? null : productDetailSchema.parse(body).data;
});

export const getCategories = cache(async (): Promise<Category[]> => {
  return categoryListSchema.parse(await fetchFromApi('/categories')).data;
});
