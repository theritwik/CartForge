import { Prisma } from '@cartforge/db';
import { AppError } from '../../lib/errors.js';
import { prisma } from '../../lib/prisma.js';
import { uniqueViolationField } from '../../lib/prisma-errors.js';
import { invalidateCatalogCache } from './catalog-cache.js';
import type {
  AdminProductQuery,
  CategoryInput,
  CreateProductInput,
  UpdateProductInput,
} from '../admin/admin.schemas.js';

/** A product is low on stock when this many or fewer units can still be bought. */
export const LOW_STOCK_THRESHOLD = 5;

const adminProductSelect = {
  id: true,
  name: true,
  slug: true,
  description: true,
  pricePaise: true,
  status: true,
  stockQuantity: true,
  reservedQuantity: true,
  createdAt: true,
  updatedAt: true,
  category: { select: { id: true, name: true, slug: true } },
  images: { select: { url: true, altText: true }, orderBy: { position: 'asc' }, take: 1 },
} satisfies Prisma.ProductSelect;

type AdminProductRow = Prisma.ProductGetPayload<{ select: typeof adminProductSelect }>;

function toAdminProduct({ images, ...product }: AdminProductRow) {
  const availableQuantity = Math.max(product.stockQuantity - product.reservedQuantity, 0);
  return {
    ...product,
    image: images[0] ?? null,
    availableQuantity,
    isLowStock: product.status === 'ACTIVE' && availableQuantity <= LOW_STOCK_THRESHOLD,
  };
}

function conflictFor(error: unknown, entity: 'product' | 'category'): AppError | null {
  const field = uniqueViolationField(error, entity === 'product' ? ['slug'] : ['slug', 'name']);
  if (!field) {
    return null;
  }
  return new AppError(409, 'ALREADY_EXISTS', `Another ${entity} already uses this ${field}.`, [
    { path: field, message: `This ${field} is already in use` },
  ]);
}

async function assertCategoryExists(categoryId: string): Promise<void> {
  const category = await prisma.category.findUnique({
    where: { id: categoryId },
    select: { id: true },
  });
  if (!category) {
    throw new AppError(400, 'VALIDATION_ERROR', 'The request is invalid.', [
      { path: 'categoryId', message: 'Choose an existing category' },
    ]);
  }
}

/** Products in every status, for administrators. */
export async function listAdminProducts(query: AdminProductQuery) {
  const where: Prisma.ProductWhereInput = {
    status: query.status,
    categoryId: query.categoryId,
  };
  if (query.q) {
    where.OR = [
      { name: { contains: query.q, mode: 'insensitive' } },
      { slug: { contains: query.q.toLowerCase() } },
    ];
  }

  if (query.lowStock) {
    // "Available" is a difference of two columns, which Prisma cannot filter on directly.
    const lowStockIds = await prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM products
      WHERE status = 'ACTIVE' AND stock_quantity - reserved_quantity <= ${LOW_STOCK_THRESHOLD}
    `;
    where.id = { in: lowStockIds.map((row) => row.id) };
  }

  const [products, totalItems] = await prisma.$transaction([
    prisma.product.findMany({
      where,
      select: adminProductSelect,
      orderBy: query.lowStock
        ? [{ stockQuantity: 'asc' }, { id: 'asc' }]
        : [{ updatedAt: 'desc' }, { id: 'desc' }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.product.count({ where }),
  ]);

  return {
    data: products.map(toAdminProduct),
    meta: {
      page: query.page,
      pageSize: query.pageSize,
      totalItems,
      totalPages: Math.ceil(totalItems / query.pageSize),
    },
  };
}

export async function getAdminProduct(productId: string) {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: adminProductSelect,
  });
  if (!product) {
    throw new AppError(404, 'PRODUCT_NOT_FOUND', 'Product not found.');
  }
  return toAdminProduct(product);
}

export async function createProduct(input: CreateProductInput) {
  await assertCategoryExists(input.categoryId);
  try {
    const product = await prisma.product.create({ data: input, select: { id: true } });
    await invalidateCatalogCache();
    return await getAdminProduct(product.id);
  } catch (error) {
    throw conflictFor(error, 'product') ?? error;
  }
}

/**
 * Updates catalog fields. Stock is not among them: it changes only through stock
 * adjustments. Past orders are unaffected because order items keep their own
 * copy of the name and price.
 */
export async function updateProduct(productId: string, input: UpdateProductInput) {
  if (input.categoryId) {
    await assertCategoryExists(input.categoryId);
  }
  try {
    const { count } = await prisma.product.updateMany({ where: { id: productId }, data: input });
    if (count === 0) {
      throw new AppError(404, 'PRODUCT_NOT_FOUND', 'Product not found.');
    }
  } catch (error) {
    throw conflictFor(error, 'product') ?? error;
  }
  // Any catalog field can change what lists show: name, slug, price, category, or status.
  await invalidateCatalogCache();
  return getAdminProduct(productId);
}

export async function listAdminCategories() {
  const [categories, activeCounts] = await Promise.all([
    prisma.category.findMany({
      select: {
        id: true,
        name: true,
        slug: true,
        createdAt: true,
        _count: { select: { products: true } },
      },
      orderBy: { name: 'asc' },
    }),
    prisma.product.groupBy({
      by: ['categoryId'],
      where: { status: 'ACTIVE' },
      _count: { _all: true },
    }),
  ]);
  const activeByCategory = new Map(activeCounts.map((row) => [row.categoryId, row._count._all]));

  return categories.map(({ _count, ...category }) => ({
    ...category,
    productCount: _count.products,
    activeProductCount: activeByCategory.get(category.id) ?? 0,
  }));
}

export async function createCategory(input: CategoryInput) {
  try {
    const category = await prisma.category.create({
      data: input,
      select: { id: true, name: true, slug: true, createdAt: true },
    });
    await invalidateCatalogCache();
    return category;
  } catch (error) {
    throw conflictFor(error, 'category') ?? error;
  }
}

export async function updateCategory(categoryId: string, input: Partial<CategoryInput>) {
  try {
    const { count } = await prisma.category.updateMany({ where: { id: categoryId }, data: input });
    if (count === 0) {
      throw new AppError(404, 'CATEGORY_NOT_FOUND', 'Category not found.');
    }
  } catch (error) {
    throw conflictFor(error, 'category') ?? error;
  }
  // Category names and slugs appear in every cached product list.
  await invalidateCatalogCache();
  return prisma.category.findUniqueOrThrow({
    where: { id: categoryId },
    select: { id: true, name: true, slug: true, createdAt: true },
  });
}

/**
 * Deletes a category that holds no products. A category with products, even
 * archived ones, cannot be deleted: archived products keep their category so
 * they can be reactivated, and the foreign key would refuse anyway.
 */
export async function deleteCategory(categoryId: string): Promise<void> {
  const category = await prisma.category.findUnique({
    where: { id: categoryId },
    select: { _count: { select: { products: true } } },
  });
  if (!category) {
    throw new AppError(404, 'CATEGORY_NOT_FOUND', 'Category not found.');
  }
  if (category._count.products > 0) {
    throw new AppError(
      409,
      'CATEGORY_HAS_PRODUCTS',
      'This category still has products. Move or remove them first.',
      { productCount: category._count.products },
    );
  }
  // A product added since the check above makes the foreign key refuse the delete.
  try {
    await prisma.category.delete({ where: { id: categoryId } });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
      throw new AppError(409, 'CATEGORY_HAS_PRODUCTS', 'This category still has products.');
    }
    throw error;
  }
  await invalidateCatalogCache();
}
