import type { Prisma } from '@cartforge/db';
import { AppError } from '../../lib/errors.js';
import { prisma } from '../../lib/prisma.js';
import { slugSchema, type ListProductsQuery } from './products.schemas.js';

const MAX_SEARCH_TERMS = 5;

const imageSelect = {
  select: { url: true, altText: true },
  orderBy: { position: 'asc' },
} satisfies Prisma.Product$imagesArgs;

const productSelect = {
  id: true,
  name: true,
  slug: true,
  pricePaise: true,
  stockQuantity: true,
  reservedQuantity: true,
  category: { select: { name: true, slug: true } },
} satisfies Prisma.ProductSelect;

const productSummarySelect = {
  ...productSelect,
  images: { ...imageSelect, take: 1 },
} satisfies Prisma.ProductSelect;

const productDetailSelect = {
  ...productSelect,
  description: true,
  images: imageSelect,
} satisfies Prisma.ProductSelect;

type ProductSummaryRow = Prisma.ProductGetPayload<{ select: typeof productSummarySelect }>;

const sortOrders: Record<ListProductsQuery['sort'], Prisma.ProductOrderByWithRelationInput[]> = {
  // The id tiebreaker keeps page boundaries stable when values are equal.
  newest: [{ createdAt: 'desc' }, { id: 'desc' }],
  price_asc: [{ pricePaise: 'asc' }, { id: 'asc' }],
  price_desc: [{ pricePaise: 'desc' }, { id: 'asc' }],
};

function availability(product: { stockQuantity: number; reservedQuantity: number }) {
  const availableQuantity = Math.max(product.stockQuantity - product.reservedQuantity, 0);
  return { availableQuantity, inStock: availableQuantity > 0 };
}

function toProductSummary(product: ProductSummaryRow) {
  return {
    id: product.id,
    name: product.name,
    slug: product.slug,
    pricePaise: product.pricePaise,
    category: product.category,
    image: product.images[0] ?? null,
    ...availability(product),
  };
}

/** Prisma passes `contains` values to LIKE unescaped, so wildcards are escaped here. */
function escapeLikePattern(term: string): string {
  return term.replace(/[\\%_]/g, '\\$&');
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
    const terms = query.q.split(/\s+/).slice(0, MAX_SEARCH_TERMS).map(escapeLikePattern);
    filter.AND = terms.map((term) => ({
      OR: [
        { name: { contains: term, mode: 'insensitive' } },
        { description: { contains: term, mode: 'insensitive' } },
      ],
    }));
  }

  return filter;
}

export async function listProducts(query: ListProductsQuery) {
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

  return {
    data: products.map(toProductSummary),
    meta: {
      page: query.page,
      pageSize: query.pageSize,
      totalItems,
      totalPages: Math.ceil(totalItems / query.pageSize),
    },
  };
}

export async function getProductBySlug(slug: string) {
  // A value that is not a well-formed slug cannot match a product, so it is not queried.
  const product = slugSchema.safeParse(slug).success
    ? await prisma.product.findFirst({
        where: { slug, status: 'ACTIVE' },
        select: productDetailSelect,
      })
    : null;
  if (!product) {
    throw new AppError(404, 'PRODUCT_NOT_FOUND', 'Product not found.');
  }

  return {
    id: product.id,
    name: product.name,
    slug: product.slug,
    description: product.description,
    pricePaise: product.pricePaise,
    category: product.category,
    images: product.images,
    ...availability(product),
  };
}

/** Categories that have at least one published product. */
export async function listCategories() {
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
}
