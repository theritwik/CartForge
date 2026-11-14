import { truncateAllTables } from '@cartforge/db/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';

const app = createApp();

interface ProductSummary {
  name: string;
  slug: string;
  pricePaise: number;
  availableQuantity: number;
  inStock: boolean;
}

async function listProducts(query: Record<string, string | number> = {}) {
  const response = await request(app).get('/api/v1/products').query(query);
  const body = response.body as { data: ProductSummary[]; meta: Record<string, number> };
  return { status: response.status, body, names: body.data.map((product) => product.name) };
}

beforeAll(async () => {
  await truncateAllTables(prisma);

  const audio = await prisma.category.create({ data: { name: 'Audio', slug: 'audio' } });
  const kitchen = await prisma.category.create({ data: { name: 'Kitchen', slug: 'kitchen' } });
  const garden = await prisma.category.create({ data: { name: 'Garden', slug: 'garden' } });

  // Created oldest first, one minute apart, so the default "newest" order is predictable.
  const products = [
    {
      name: 'Wireless Headphones',
      slug: 'wireless-headphones',
      description: 'Over-ear headphones with long battery life.',
      pricePaise: 500_000,
      stockQuantity: 10,
      reservedQuantity: 2,
      categoryId: audio.id,
      images: {
        create: [
          { url: '/images/headphones-side.svg', altText: 'Side view', position: 1 },
          { url: '/images/headphones-front.svg', altText: 'Front view', position: 0 },
        ],
      },
    },
    {
      name: 'Studio Speaker',
      slug: 'studio-speaker',
      description: 'Bookshelf speaker for a desk or small room.',
      pricePaise: 1_200_000,
      stockQuantity: 4,
      reservedQuantity: 4,
      categoryId: audio.id,
    },
    {
      name: 'Steel Kettle',
      slug: 'steel-kettle',
      description: 'Boils a litre of water in three minutes.',
      pricePaise: 150_000,
      stockQuantity: 5,
      categoryId: kitchen.id,
    },
    {
      name: 'Chef Knife',
      slug: 'chef-knife',
      description: '100% forged steel blade with a full tang.',
      pricePaise: 300_000,
      stockQuantity: 7,
      categoryId: kitchen.id,
    },
    {
      name: 'Draft Mixer',
      slug: 'draft-mixer',
      description: 'Not published yet.',
      pricePaise: 250_000,
      stockQuantity: 3,
      status: 'DRAFT' as const,
      categoryId: garden.id,
    },
    {
      name: 'Archived Radio',
      slug: 'archived-radio',
      description: 'No longer sold.',
      pricePaise: 90_000,
      stockQuantity: 1,
      status: 'ARCHIVED' as const,
      categoryId: audio.id,
    },
  ];
  for (const [index, product] of products.entries()) {
    await prisma.product.create({
      data: {
        ...product,
        status: product.status ?? 'ACTIVE',
        createdAt: new Date(2026, 0, 1, 0, index),
      },
    });
  }
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('GET /api/v1/products', () => {
  it('lists active products, newest first, with pagination metadata', async () => {
    const { status, body, names } = await listProducts();

    expect(status).toBe(200);
    expect(names).toEqual(['Chef Knife', 'Steel Kettle', 'Studio Speaker', 'Wireless Headphones']);
    expect(body.meta).toEqual({ page: 1, pageSize: 12, totalItems: 4, totalPages: 1 });
  });

  it('never includes draft or archived products', async () => {
    const { names } = await listProducts({ pageSize: 48 });

    expect(names).not.toContain('Draft Mixer');
    expect(names).not.toContain('Archived Radio');
  });

  it('returns price in paise, category, primary image, and available stock', async () => {
    const { body } = await listProducts({ q: 'headphones' });

    expect(body.data).toEqual([
      {
        id: expect.any(String) as unknown,
        name: 'Wireless Headphones',
        slug: 'wireless-headphones',
        pricePaise: 500_000,
        category: { name: 'Audio', slug: 'audio' },
        image: { url: '/images/headphones-front.svg', altText: 'Front view' },
        availableQuantity: 8,
        inStock: true,
      },
    ]);
  });

  it('reports a fully reserved product as out of stock', async () => {
    const { body } = await listProducts({ q: 'speaker' });

    expect(body.data[0]).toMatchObject({ availableQuantity: 0, inStock: false, image: null });
  });

  describe('filtering', () => {
    it('filters by category slug', async () => {
      const { names, body } = await listProducts({ category: 'kitchen' });

      expect(names).toEqual(['Chef Knife', 'Steel Kettle']);
      expect(body.meta.totalItems).toBe(2);
    });

    it('returns an empty page for a category with no active products', async () => {
      const { status, body } = await listProducts({ category: 'garden' });

      expect(status).toBe(200);
      expect(body.data).toEqual([]);
      expect(body.meta).toMatchObject({ totalItems: 0, totalPages: 0 });
    });

    it('filters by an inclusive price range in paise', async () => {
      const { names } = await listProducts({ minPricePaise: 300_000, maxPricePaise: 500_000 });

      expect(names).toEqual(['Chef Knife', 'Wireless Headphones']);
    });

    it('accepts a minimum or a maximum price on its own', async () => {
      expect((await listProducts({ minPricePaise: 500_001 })).names).toEqual(['Studio Speaker']);
      expect((await listProducts({ maxPricePaise: 150_000 })).names).toEqual(['Steel Kettle']);
    });

    it('combines category, price, and search filters', async () => {
      const { names } = await listProducts({
        category: 'kitchen',
        q: 'steel',
        minPricePaise: 200_000,
      });

      expect(names).toEqual(['Chef Knife']);
    });
  });

  describe('search', () => {
    it('matches the product name regardless of case', async () => {
      expect((await listProducts({ q: 'WIRELESS' })).names).toEqual(['Wireless Headphones']);
    });

    it('matches the description', async () => {
      expect((await listProducts({ q: 'boils' })).names).toEqual(['Steel Kettle']);
    });

    it('requires every term to match, in any order', async () => {
      expect((await listProducts({ q: 'headphones wireless' })).names).toEqual([
        'Wireless Headphones',
      ]);
      expect((await listProducts({ q: 'wireless kettle' })).names).toEqual([]);
    });

    it('treats SQL wildcard characters as plain text', async () => {
      // As a wildcard, "%" would match every product. Only one description contains the character.
      expect((await listProducts({ q: '%' })).names).toEqual(['Chef Knife']);
      expect((await listProducts({ q: '100%' })).names).toEqual(['Chef Knife']);
      expect((await listProducts({ q: '_' })).names).toEqual([]);
      expect((await listProducts({ q: '\\' })).names).toEqual([]);
    });

    it('does not find draft products', async () => {
      expect((await listProducts({ q: 'mixer' })).names).toEqual([]);
    });
  });

  describe('sorting', () => {
    it('sorts by price ascending', async () => {
      expect((await listProducts({ sort: 'price_asc' })).names).toEqual([
        'Steel Kettle',
        'Chef Knife',
        'Wireless Headphones',
        'Studio Speaker',
      ]);
    });

    it('sorts by price descending', async () => {
      expect((await listProducts({ sort: 'price_desc' })).names).toEqual([
        'Studio Speaker',
        'Wireless Headphones',
        'Chef Knife',
        'Steel Kettle',
      ]);
    });
  });

  describe('pagination', () => {
    it('splits results into pages without overlap', async () => {
      const firstPage = await listProducts({ pageSize: 3, page: 1 });
      const secondPage = await listProducts({ pageSize: 3, page: 2 });

      expect(firstPage.names).toEqual(['Chef Knife', 'Steel Kettle', 'Studio Speaker']);
      expect(secondPage.names).toEqual(['Wireless Headphones']);
      expect(secondPage.body.meta).toEqual({ page: 2, pageSize: 3, totalItems: 4, totalPages: 2 });
    });

    it('returns an empty page beyond the last page', async () => {
      const { status, body } = await listProducts({ page: 5 });

      expect(status).toBe(200);
      expect(body.data).toEqual([]);
      expect(body.meta.totalItems).toBe(4);
    });
  });

  describe('invalid query parameters', () => {
    it.each([
      ['page', { page: 0 }],
      ['page', { page: 'two' }],
      ['pageSize', { pageSize: 49 }],
      ['pageSize', { pageSize: 0 }],
      ['sort', { sort: 'cheapest' }],
      ['category', { category: 'Not A Slug' }],
      ['minPricePaise', { minPricePaise: -1 }],
      ['maxPricePaise', { maxPricePaise: '12.5' }],
      ['minPricePaise', { minPricePaise: 500, maxPricePaise: 100 }],
      ['q', { q: 'x'.repeat(101) }],
      ['q', { q: 'steel\u0000' }],
      ['q', { q: '   ' }],
      ['minPricePaise', { minPricePaise: '1e3' }],
      ['page', { page: '0x2' }],
      ['pageSize', { pageSize: ' 5' }],
      ['page', { page: ['1', '2'] }],
    ])('rejects an invalid %s with a validation error', async (path, query) => {
      const response = await request(app).get('/api/v1/products').query(query);
      const body = response.body as { error: { code: string; details: { path: string }[] } };

      expect(response.status).toBe(400);
      expect(body.error.code).toBe('VALIDATION_ERROR');
      expect(body.error.details.map((detail) => detail.path)).toContain(path);
    });
  });
});

describe('GET /api/v1/products/:slug', () => {
  it('returns the product with its description and all images in display order', async () => {
    const response = await request(app).get('/api/v1/products/wireless-headphones');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      data: {
        id: expect.any(String) as unknown,
        name: 'Wireless Headphones',
        slug: 'wireless-headphones',
        description: 'Over-ear headphones with long battery life.',
        pricePaise: 500_000,
        category: { name: 'Audio', slug: 'audio' },
        images: [
          { url: '/images/headphones-front.svg', altText: 'Front view' },
          { url: '/images/headphones-side.svg', altText: 'Side view' },
        ],
        availableQuantity: 8,
        inStock: true,
      },
    });
  });

  it('shows an out-of-stock product with zero availability', async () => {
    const response = await request(app).get('/api/v1/products/studio-speaker');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ data: { availableQuantity: 0, inStock: false } });
  });

  it.each(['draft-mixer', 'archived-radio', 'does-not-exist', 'Not%20A%20Slug', '%00'])(
    'returns 404 for %s',
    async (slug) => {
      const response = await request(app).get(`/api/v1/products/${slug}`);

      expect(response.status).toBe(404);
      expect(response.body).toMatchObject({ error: { code: 'PRODUCT_NOT_FOUND' } });
    },
  );
});

describe('GET /api/v1/categories', () => {
  it('lists categories that have published products, with their product counts', async () => {
    const response = await request(app).get('/api/v1/categories');
    const body = response.body as { data: { name: string; slug: string; productCount: number }[] };

    expect(response.status).toBe(200);
    expect(body.data.map(({ name, slug, productCount }) => ({ name, slug, productCount }))).toEqual(
      [
        { name: 'Audio', slug: 'audio', productCount: 2 },
        { name: 'Kitchen', slug: 'kitchen', productCount: 2 },
      ],
    );
  });
});
