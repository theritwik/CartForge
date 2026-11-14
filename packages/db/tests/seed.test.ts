import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { seedCatalog } from '../prisma/seed-catalog.js';
import { createPrismaClient } from '../src/index.js';
import { truncateAllTables } from '../src/testing.js';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL was not provided by the Vitest configuration.');
}
const prisma = createPrismaClient(databaseUrl);

beforeEach(async () => {
  await truncateAllTables(prisma);
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function countCatalogRows() {
  return {
    categories: await prisma.category.count(),
    products: await prisma.product.count(),
    images: await prisma.productImage.count(),
  };
}

describe('seedCatalog', () => {
  it('creates categories, products, and one primary image per product', async () => {
    const summary = await seedCatalog(prisma);

    expect(summary).toEqual({ categories: 5, products: 20, images: 20 });
    expect(await countCatalogRows()).toEqual(summary);
    expect(await prisma.product.count({ where: { images: { none: {} } } })).toBe(0);
  });

  it('creates no duplicates when run again', async () => {
    const firstRun = await seedCatalog(prisma);
    await seedCatalog(prisma);

    expect(await countCatalogRows()).toEqual(firstRun);
  });

  it('restores catalog fields but keeps stock changed since the first run', async () => {
    await seedCatalog(prisma);
    const before = await prisma.product.findFirstOrThrow({ where: { stockQuantity: { gt: 1 } } });
    await prisma.product.update({
      where: { id: before.id },
      data: { name: 'Edited locally', stockQuantity: 1 },
    });

    await seedCatalog(prisma);

    const after = await prisma.product.findUniqueOrThrow({ where: { id: before.id } });
    expect(after.name).toBe(before.name);
    expect(after.stockQuantity).toBe(1);
  });
});
