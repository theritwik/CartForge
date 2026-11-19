import type { Prisma } from '@cartforge/db';
import { z } from 'zod';
import { AppError } from '../../lib/errors.js';
import { prisma } from '../../lib/prisma.js';
import { CACHE_TTL_SECONDS, readThrough } from './catalog-cache.js';
import { slugSchema, type ListProductsQuery } from './products.schemas.js';

const MAX_SEARCH_TERMS = 5;

const imageSelect = {
  select: { url: true, altText: true },
  orderBy: { position: 'asc' },
} satisfies Prisma.Product$imagesArgs;

/** Price, status, and stock: the fields that are never served from the cache. */
const liveFieldsSelect = {
  id: true,
  pricePaise: true,
  status: true,
  stockQuantity: true,
  reservedQuantity: true,
} satisfies Prisma.ProductSelect;

type LiveFields = Prisma.ProductGetPayload<{ select: typeof liveFieldsSelect }>;

const productSummarySelect = {
  ...liveFieldsSelect,
  name: true,
  slug: true,
  category: { select: { name: true, slug: true } },
  images: { ...imageSelect, take: 1 },
} satisfies Prisma.ProductSelect;

const productDetailSelect = {
  ...liveFieldsSelect,
  name: true,
  slug: true,
  description: true,
  category: { select: { name: true, slug: true } },
  images: imageSelect,
} satisfies Prisma.ProductSelect;

const sortOrders: Record<ListProductsQuery['sort'], Prisma.ProductOrderByWithRelationInput[]> = {
  // The id tiebreaker keeps page boundaries stable when values are equal. Each order
  // matches an index (read forwards or backwards), so no request sorts the whole catalog.
  newest: [{ createdAt: 'desc' }, { id: 'desc' }],
  price_asc: [{ pricePaise: 'asc' }, { id: 'asc' }],
  price_desc: [{ pricePaise: 'desc' }, { id: 'desc' }],
};

// What the cache may hold: query results and display fields, never price, status, or stock.
const cachedImageSchema = z.object({ url: z.string(), altText: z.string() });
const cachedCategorySchema = z.object({ name: z.string(), slug: z.string() });

const cachedProductListSchema = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      slug: z.string(),
      category: cachedCategorySchema,
      image: cachedImageSchema.nullable(),
    }),
  ),
  totalItems: z.number().int(),
});

const cachedProductDetailSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  description: z.string(),
  category: cachedCategorySchema,
  images: z.array(cachedImageSchema),
});

const cachedCategoryListSchema = z.array(
  z.object({ id: z.string(), name: z.string(), slug: z.string(), productCount: z.number().int() }),
);

function availability(product: { stockQuantity: number; reservedQuantity: number }) {
  const availableQuantity = Math.max(product.stockQuantity - product.reservedQuantity, 0);
  return { availableQuantity, inStock: availableQuantity > 0 };
}

/** Current price, status, and stock by primary key, always from the database. */
async function liveFieldsById(ids: string[]): Promise<Map<string, LiveFields>> {
  const rows = await prisma.product.findMany({
    where: { id: { in: ids } },
    select: liveFieldsSelect,
  });
  return new Map(rows.map((row) => [row.id, row]));
}

/** Prisma passes `contains` values to LIKE unescaped, so wildcards are escaped here. */
function escapeLikePattern(term: string): string {
  return term.replace(/[\\%_]/g, '\\$&');
}

function searchTerms(q: string): string[] {
  return q.split(/\s+/).slice(0, MAX_SEARCH_TERMS);
}

function buildProductFilter(query: ListProductsQuery): Prisma.ProductWhereInput {
  const filter: Prisma.ProductWhereInput = { status: 'ACTIVE' };

  if (query.category) {
    filter.category = { slug: query.category };
  }
  if (query.minPricePaise !== undefined || query.maxPricePaise !== undefined) {
    filter.pricePaise = { gte: query.minPricePaise, lte: query.maxPricePaise };
  }
  if (query.q) {
    // Every search term must appear in the name or the description.
    filter.AND = searchTerms(query.q)
      .map(escapeLikePattern)
      .map((term) => ({
        OR: [
          { name: { contains: term, mode: 'insensitive' } },
          { description: { contains: term, mode: 'insensitive' } },
        ],
      }));
  }

  return filter;
}

/** The query, normalized so that requests with the same results share a cache entry. */
function cacheParameters(query: ListProductsQuery): Record<string, unknown> {
  return {
    // Search ignores case and only the first few terms count, so neither changes the key.
    q: query.q ? searchTerms(query.q.toLowerCase()).join(' ') : undefined,
    category: query.category,
    minPricePaise: query.minPricePaise,
    maxPricePaise: query.maxPricePaise,
    sort: query.sort,
    page: query.page,
    pageSize: query.pageSize,
  };
}

/**
 * A page of published products. Which products match, in what order, and how
 * many come from the cache when possible; price, status, and stock are always
 * read from the database. A product withdrawn since the entry was cached is
 * left out, and no stale price or stock figure is ever returned.
 */
export async function listProducts(query: ListProductsQuery) {
  let freshRows: LiveFields[] | undefined;

  const page = await readThrough({
    kind: 'products',
    parameters: cacheParameters(query),
    ttlSeconds: CACHE_TTL_SECONDS.productList,
    schema: cachedProductListSchema,
    load: async () => {
      const where = buildProductFilter(query);
      const [products, totalItems] = await prisma.$transaction([
        prisma.product.findMany({
          where,
          select: productSummarySelect,
          orderBy: sortOrders[query.sort],
          skip: (query.page - 1) * query.pageSize,
          take: query.pageSize,
        }),
        prisma.product.count({ where }),
      ]);
      freshRows = products;
      return {
        items: products.map(({ id, name, slug, category, images }) => ({
          id,
          name,
          slug,
          category,
          image: images[0] ?? null,
        })),
        totalItems,
      };
    },
  });

  // After a miss the rows were just read and are current; after a hit, read the live fields.
  const live = freshRows
    ? new Map(freshRows.map((row) => [row.id, row]))
    : await liveFieldsById(page.items.map((item) => item.id));

  const data = page.items.flatMap(({ id, name, slug, category, image }) => {
    const current = live.get(id);
    if (current?.status !== 'ACTIVE') {
      return [];
    }
    return [
      { id, name, slug, pricePaise: current.pricePaise, category, image, ...availability(current) },
    ];
  });

  return {
    data,
    meta: {
      page: query.page,
      pageSize: query.pageSize,
      totalItems: page.totalItems,
      totalPages: Math.ceil(page.totalItems / query.pageSize),
    },
  };
}

/** One published product. Display fields may come from the cache; price, status, and stock never do. */
export async function getProductBySlug(slug: string) {
  // A value that is not a well-formed slug cannot match a product, so it is not queried.
  if (!slugSchema.safeParse(slug).success) {
    throw new AppError(404, 'PRODUCT_NOT_FOUND', 'Product not found.');
  }

  let freshRow: LiveFields | undefined;
  const details = await readThrough({
    kind: 'product',
    parameters: { slug },
    ttlSeconds: CACHE_TTL_SECONDS.productDetail,
    schema: cachedProductDetailSchema.nullable(),
    load: async () => {
      const product = await prisma.product.findFirst({
        where: { slug, status: 'ACTIVE' },
        select: productDetailSelect,
      });
      if (!product) {
        return null;
      }
      const { id, name, description, category, images } = product;
      freshRow = product;
      return { id, name, slug: product.slug, description, category, images };
    },
  });

  const current = details
    ? (freshRow ?? (await liveFieldsById([details.id])).get(details.id))
    : undefined;
  if (!details || current?.status !== 'ACTIVE') {
    throw new AppError(404, 'PRODUCT_NOT_FOUND', 'Product not found.');
  }

  return {
    id: details.id,
    name: details.name,
    slug: details.slug,
    description: details.description,
    pricePaise: current.pricePaise,
    category: details.category,
    images: details.images,
    ...availability(current),
  };
}

/**
 * Categories that have at least one published product, with counts. The counts
 * depend only on which products are published, which changes only through
 * catalog writes, so the whole result is cached.
 */
export async function listCategories() {
  return readThrough({
    kind: 'categories',
    parameters: {},
    ttlSeconds: CACHE_TTL_SECONDS.categories,
    schema: cachedCategoryListSchema,
    load: async () => {
      const categories = await prisma.category.findMany({
        where: { products: { some: { status: 'ACTIVE' } } },
        select: {
          id: true,
          name: true,
          slug: true,
          _count: { select: { products: { where: { status: 'ACTIVE' } } } },
        },
        orderBy: { name: 'asc' },
      });
      return categories.map(({ _count, ...category }) => ({
        ...category,
        productCount: _count.products,
      }));
    },
  });
}
