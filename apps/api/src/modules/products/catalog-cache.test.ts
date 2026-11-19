import { randomUUID } from 'node:crypto';
import { truncateAllTables } from '@cartforge/db/testing';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  app,
  patch,
  post,
  resetRedisState,
  signUp,
  type SignedUpUser,
} from '../../../tests/auth-helpers.js';
import { env } from '../../config/env.js';
import { prisma } from '../../lib/prisma.js';
import { cacheRedis, redis } from '../../lib/redis.js';
import { CACHE_TTL_SECONDS, CATALOG_GENERATION_KEY } from './catalog-cache.js';

const CACHE_KEY_PATTERN = `cartforge:${env.NODE_ENV}:catalog:v1:*`;
const address = {
  name: 'Asha Rao',
  phone: '9876543210',
  addressLine1: '12 MG Road',
  city: 'Bengaluru',
  state: 'Karnataka',
  postalCode: '560001',
};

interface ListedProduct {
  id: string;
  name: string;
  slug: string;
  pricePaise: number;
  availableQuantity: number;
  inStock: boolean;
  category: { name: string; slug: string };
}

let admin: SignedUpUser;
let kitchen: { id: string };
let kettle: { id: string };

async function cacheKeys(): Promise<string[]> {
  const keys: string[] = [];
  for await (const batch of cacheRedis.scanIterator({ MATCH: CACHE_KEY_PATTERN })) {
    keys.push(...batch);
  }
  return keys.sort();
}

async function listProducts(query: Record<string, string | number> = {}) {
  const response = await request(app).get('/api/v1/products').query(query);
  expect(response.status).toBe(200);
  return response.body as { data: ListedProduct[]; meta: { totalItems: number } };
}

async function productDetail(slug: string) {
  return request(app).get(`/api/v1/products/${slug}`);
}

async function listCategories() {
  const response = await request(app).get('/api/v1/categories');
  expect(response.status).toBe(200);
  return (response.body as { data: { name: string; slug: string; productCount: number }[] }).data;
}

function adminPatch(path: string) {
  return patch(`/api/v1/admin${path}`).set('Cookie', admin.cookie);
}

function adminPost(path: string) {
  return post(`/api/v1/admin${path}`).set('Cookie', admin.cookie);
}

beforeAll(async () => {
  await Promise.all([redis.connect(), cacheRedis.connect()]);
});

beforeEach(async () => {
  await truncateAllTables(prisma);
  await resetRedisState();
  kitchen = await prisma.category.create({ data: { name: 'Kitchen', slug: 'kitchen' } });
  kettle = await prisma.product.create({
    data: {
      name: 'Steel Kettle',
      slug: 'steel-kettle',
      description: 'Boils a litre of water in three minutes.',
      pricePaise: 150_000,
      stockQuantity: 10,
      status: 'ACTIVE',
      categoryId: kitchen.id,
    },
  });
  admin = await signUp();
  await prisma.user.update({ where: { id: admin.id }, data: { role: 'ADMIN' } });
});

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(async () => {
  await Promise.all([redis.close(), cacheRedis.close()]);
  await prisma.$disconnect();
});

describe('cache-aside reads', () => {
  it('serves a repeated list request from the cache without counting again', async () => {
    const countSpy = vi.spyOn(prisma.product, 'count');

    const first = await listProducts();
    const second = await listProducts();

    expect(countSpy).toHaveBeenCalledTimes(1);
    expect(second).toEqual(first);
    expect(second.data.map((product) => product.name)).toEqual(['Steel Kettle']);
  });

  it('serves a repeated detail request from the cache', async () => {
    const findFirstSpy = vi.spyOn(prisma.product, 'findFirst');

    const first = await productDetail('steel-kettle');
    const second = await productDetail('steel-kettle');

    expect(first.status).toBe(200);
    expect(second.body).toEqual(first.body);
    expect(findFirstSpy).toHaveBeenCalledTimes(1);
  });

  it('serves repeated category requests from the cache', async () => {
    const findManySpy = vi.spyOn(prisma.category, 'findMany');

    await listCategories();
    const categories = await listCategories();

    expect(findManySpy).toHaveBeenCalledTimes(1);
    expect(categories).toEqual([
      expect.objectContaining({ name: 'Kitchen', slug: 'kitchen', productCount: 1 }),
    ]);
  });

  it('stores entries with a TTL and reloads from the database once they expire', async () => {
    await listProducts();
    await productDetail('steel-kettle');
    await listCategories();

    const keys = await cacheKeys();
    expect(keys).toHaveLength(3);
    const ttls = await Promise.all(keys.map((key) => cacheRedis.ttl(key)));
    const longestTtl = Math.max(...Object.values(CACHE_TTL_SECONDS));
    for (const ttl of ttls) {
      expect(ttl).toBeGreaterThan(0);
      expect(ttl).toBeLessThanOrEqual(longestTtl);
    }

    await Promise.all(keys.map((key) => cacheRedis.pExpire(key, 1)));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(await cacheKeys()).toEqual([]);

    const countSpy = vi.spyOn(prisma.product, 'count');
    await listProducts();
    expect(countSpy).toHaveBeenCalledTimes(1);
  });

  it('caches a missing product so repeated misses do not reach the product query', async () => {
    const findFirstSpy = vi.spyOn(prisma.product, 'findFirst');

    expect((await productDetail('no-such-product')).status).toBe(404);
    expect((await productDetail('no-such-product')).status).toBe(404);

    expect(findFirstSpy).toHaveBeenCalledTimes(1);
  });

  it('does not query or cache values that are not slugs', async () => {
    const findFirstSpy = vi.spyOn(prisma.product, 'findFirst');

    expect((await productDetail('Not%20A%20Slug')).status).toBe(404);

    expect(findFirstSpy).not.toHaveBeenCalled();
    expect(await cacheKeys()).toEqual([]);
  });

  it('answers concurrent identical requests consistently', async () => {
    const responses = await Promise.all(
      Array.from({ length: 10 }, () => request(app).get('/api/v1/products')),
    );

    expect(responses.map((response) => response.status)).toEqual(Array(10).fill(200));
    for (const response of responses) {
      expect(response.body).toEqual(responses[0]?.body);
    }
    expect(await cacheKeys()).toHaveLength(1);
  });
});

describe('cache keys', () => {
  it('shares one entry between searches that differ only in case and spacing', async () => {
    const countSpy = vi.spyOn(prisma.product, 'count');

    const first = await listProducts({ q: 'Steel  KETTLE' });
    const second = await listProducts({ q: 'steel kettle' });

    expect(first.data.map((product) => product.name)).toEqual(['Steel Kettle']);
    expect(second).toEqual(first);
    expect(countSpy).toHaveBeenCalledTimes(1);
  });

  it('gives every distinct filter, sort, and page its own entry', async () => {
    const queries: Record<string, string | number>[] = [
      {},
      { q: 'steel' },
      { category: 'kitchen' },
      { minPricePaise: 100 },
      { maxPricePaise: 100 },
      { sort: 'price_asc' },
      { sort: 'price_desc' },
      { page: 2 },
      { pageSize: 5 },
    ];
    for (const query of queries) {
      await listProducts(query);
    }

    expect(await cacheKeys()).toHaveLength(queries.length);
    // A cached empty result for one filter is never served for another.
    expect((await listProducts({ maxPricePaise: 100 })).data).toEqual([]);
    expect((await listProducts({ minPricePaise: 100 })).data).toHaveLength(1);
  });

  it('keys hold no user, session, or cart data and signed-in visitors get the public response', async () => {
    const customer = await signUp();
    const anonymous = await listProducts();
    const signedIn = await request(app).get('/api/v1/products').set('Cookie', customer.cookie);
    await request(app).get('/api/v1/cart').set('Cookie', customer.cookie);
    await request(app).get('/api/v1/auth/me').set('Cookie', customer.cookie);

    expect(signedIn.body).toEqual(anonymous);
    const keys = await cacheKeys();
    expect(keys).toHaveLength(1);
    for (const key of keys) {
      expect(key).toMatch(
        /^cartforge:test:catalog:v1:g\d+:(products|product|categories):[0-9a-f]{32}$/,
      );
      expect(key).not.toContain(customer.id);
      expect(key).not.toContain(customer.token);
    }
  });
});

describe('invalidation on catalog writes', () => {
  it('shows an edited name at once on the list and the detail page', async () => {
    await listProducts();
    await productDetail('steel-kettle');

    const response = await adminPatch(`/products/${kettle.id}`).send({ name: 'Copper Kettle' });
    expect(response.status).toBe(200);

    expect((await listProducts()).data[0]?.name).toBe('Copper Kettle');
    expect((await productDetail('steel-kettle')).body).toMatchObject({
      data: { name: 'Copper Kettle' },
    });
  });

  it('removes an archived product everywhere and restores it on reactivation', async () => {
    await listProducts();
    await productDetail('steel-kettle');
    await listCategories();

    await adminPatch(`/products/${kettle.id}`).send({ status: 'ARCHIVED' }).expect(200);

    expect((await listProducts()).data).toEqual([]);
    expect((await listProducts()).meta.totalItems).toBe(0);
    expect((await productDetail('steel-kettle')).status).toBe(404);
    expect(await listCategories()).toEqual([]);

    await adminPatch(`/products/${kettle.id}`).send({ status: 'ACTIVE' }).expect(200);

    expect((await listProducts()).data.map((product) => product.slug)).toEqual(['steel-kettle']);
    expect((await productDetail('steel-kettle')).status).toBe(200);
    expect(await listCategories()).toHaveLength(1);
  });

  it('shows a newly created product and a product moved to another category', async () => {
    const garden = await prisma.category.create({ data: { name: 'Garden', slug: 'garden' } });
    expect((await listProducts({ category: 'garden' })).data).toEqual([]);
    expect(await listCategories()).toHaveLength(1);

    const created = await adminPost('/products').send({
      name: 'Watering Can',
      slug: 'watering-can',
      description: 'Five litres.',
      pricePaise: 49_900,
      categoryId: garden.id,
      status: 'ACTIVE',
      stockQuantity: 3,
    });
    expect(created.status).toBe(201);
    expect((await listProducts({ category: 'garden' })).data.map((p) => p.slug)).toEqual([
      'watering-can',
    ]);

    await adminPatch(`/products/${kettle.id}`).send({ categoryId: garden.id }).expect(200);

    expect((await listProducts({ category: 'kitchen' })).data).toEqual([]);
    expect((await listProducts({ category: 'garden' })).meta.totalItems).toBe(2);
    expect(await listCategories()).toEqual([
      expect.objectContaining({ slug: 'garden', productCount: 2 }),
    ]);
  });

  it('shows a renamed category in the category list and on its products', async () => {
    await listCategories();
    await listProducts();

    await adminPatch(`/categories/${kitchen.id}`).send({ name: 'Cookware' }).expect(200);

    expect((await listCategories())[0]?.name).toBe('Cookware');
    expect((await listProducts()).data[0]?.category.name).toBe('Cookware');
  });

  it('advances the generation on catalog writes but not on stock adjustments', async () => {
    await adminPatch(`/products/${kettle.id}`).send({ pricePaise: 160_000 }).expect(200);
    const afterEdit = await cacheRedis.get(CATALOG_GENERATION_KEY);

    await adminPost(`/products/${kettle.id}/stock-adjustments`).send({ delta: 5 }).expect(200);

    expect(afterEdit).toBe('1');
    expect(await cacheRedis.get(CATALOG_GENERATION_KEY)).toBe('1');
  });
});

describe('live price, status, and stock', () => {
  it('returns a changed price at once even when invalidation fails', async () => {
    await listProducts();
    await productDetail('steel-kettle');
    vi.spyOn(cacheRedis, 'incr').mockRejectedValue(new Error('connection lost'));

    await adminPatch(`/products/${kettle.id}`).send({ pricePaise: 175_000 }).expect(200);

    expect((await listProducts()).data[0]?.pricePaise).toBe(175_000);
    expect((await productDetail('steel-kettle')).body).toMatchObject({
      data: { pricePaise: 175_000 },
    });
  });

  it('hides an archived product at once even when invalidation fails', async () => {
    await listProducts();
    await productDetail('steel-kettle');
    vi.spyOn(cacheRedis, 'incr').mockRejectedValue(new Error('connection lost'));

    await adminPatch(`/products/${kettle.id}`).send({ status: 'ARCHIVED' }).expect(200);

    expect((await listProducts()).data).toEqual([]);
    expect((await productDetail('steel-kettle')).status).toBe(404);
  });

  it('reflects stock changes and reservations without invalidating the cache', async () => {
    await listProducts();
    await productDetail('steel-kettle');
    const keysBefore = await cacheKeys();

    await prisma.product.update({
      where: { id: kettle.id },
      data: { stockQuantity: 4, reservedQuantity: 4 },
    });

    expect((await listProducts()).data[0]).toMatchObject({ availableQuantity: 0, inStock: false });
    expect((await productDetail('steel-kettle')).body).toMatchObject({
      data: { availableQuantity: 0, inStock: false },
    });
    expect(await cacheKeys()).toEqual(keysBefore);
  });

  it('ignores price or stock figures written into a cached entry', async () => {
    await listProducts();
    const [key] = await cacheKeys();
    const raw = key ? await cacheRedis.get(key) : null;
    if (!key || !raw) {
      throw new Error('Expected a cached list entry');
    }
    const stored = JSON.parse(raw) as { items: Record<string, unknown>[] };
    stored.items[0] = { ...stored.items[0], pricePaise: 1, availableQuantity: 999, inStock: true };
    await cacheRedis.set(key, JSON.stringify(stored));
    await prisma.product.update({ where: { id: kettle.id }, data: { stockQuantity: 0 } });

    expect((await listProducts()).data[0]).toMatchObject({
      pricePaise: 150_000,
      availableQuantity: 0,
      inStock: false,
    });
  });

  it('prices checkout from the database when the cached catalog is stale', async () => {
    const customer = await signUp();
    await listProducts();
    await productDetail('steel-kettle');
    // A change that bypasses invalidation, as a direct database edit or seed would.
    await prisma.product.update({ where: { id: kettle.id }, data: { name: 'Renamed Kettle' } });
    await prisma.product.update({ where: { id: kettle.id }, data: { pricePaise: 180_000 } });

    // The cached name is stale until the entry expires; the price is not.
    expect((await listProducts()).data[0]).toMatchObject({
      name: 'Steel Kettle',
      pricePaise: 180_000,
    });

    await post('/api/v1/cart/items')
      .set('Cookie', customer.cookie)
      .send({ productId: kettle.id, quantity: 2 })
      .expect(200);
    const checkout = (expectedTotalPaise: number) =>
      post('/api/v1/orders')
        .set('Cookie', customer.cookie)
        .set('Idempotency-Key', randomUUID())
        .send({ shippingAddress: address, expectedTotalPaise });

    const stalePrice = await checkout(300_000);
    expect(stalePrice.status).toBe(409);
    expect(stalePrice.body).toMatchObject({ error: { code: 'CART_CHANGED' } });

    const currentPrice = await checkout(360_000);
    expect(currentPrice.status).toBe(201);
    const items = await prisma.orderItem.findMany({ select: { unitPricePaise: true } });
    expect(items).toEqual([{ unitPricePaise: 180_000 }]);
  });
});

describe('Redis instances', () => {
  it('keeps catalog entries on the cache instance and rate-limit counters off it', async () => {
    await listProducts();
    await post('/api/v1/auth/login').send({
      email: 'nobody@example.com',
      password: 'wrong password',
    });

    const keysOn = async (client: typeof redis, pattern: string) => {
      const keys: string[] = [];
      for await (const batch of client.scanIterator({ MATCH: pattern })) {
        keys.push(...batch);
      }
      return keys;
    };
    const rateLimitKeys = `cartforge:${env.NODE_ENV}:ratelimit:*`;

    expect(await keysOn(redis, rateLimitKeys)).not.toEqual([]);
    expect(await keysOn(cacheRedis, rateLimitKeys)).toEqual([]);
    expect(await keysOn(redis, CACHE_KEY_PATTERN)).toEqual([]);
    expect(await cacheKeys()).toHaveLength(1);
  });
});

describe('Redis failures', () => {
  it('serves the catalog from the database while Redis is disconnected', async () => {
    vi.spyOn(cacheRedis, 'isReady', 'get').mockReturnValue(false);
    const getSpy = vi.spyOn(cacheRedis, 'get');

    expect((await listProducts()).data.map((product) => product.slug)).toEqual(['steel-kettle']);
    expect((await productDetail('steel-kettle')).status).toBe(200);
    expect(await listCategories()).toHaveLength(1);
    expect(getSpy).not.toHaveBeenCalled();
  });

  it('serves the catalog from the database when Redis commands fail', async () => {
    vi.spyOn(cacheRedis, 'get').mockRejectedValue(new Error('connection reset'));
    vi.spyOn(cacheRedis, 'set').mockRejectedValue(new Error('connection reset'));

    expect((await listProducts()).data).toHaveLength(1);
    expect((await productDetail('steel-kettle')).status).toBe(200);
    expect(await listCategories()).toHaveLength(1);
  });

  it('keeps catalog writes working when Redis cannot be reached', async () => {
    vi.spyOn(cacheRedis, 'incr').mockRejectedValue(new Error('connection reset'));

    const response = await adminPatch(`/products/${kettle.id}`).send({ pricePaise: 99_900 });

    expect(response.status).toBe(200);
    expect(
      await prisma.product.findUniqueOrThrow({
        where: { id: kettle.id },
        select: { pricePaise: true },
      }),
    ).toEqual({ pricePaise: 99_900 });
  });

  it.each([
    ['is not JSON', 'not json {'],
    ['does not match the expected shape', JSON.stringify({ items: 5 })],
  ])('replaces a cached entry that %s', async (_description, corrupted) => {
    await listProducts();
    await productDetail('steel-kettle');
    await listCategories();
    const keys = await cacheKeys();
    await Promise.all(
      keys.map((key) => cacheRedis.set(key, corrupted, { expiration: { type: 'EX', value: 60 } })),
    );

    expect((await listProducts()).data.map((product) => product.slug)).toEqual(['steel-kettle']);
    expect((await productDetail('steel-kettle')).status).toBe(200);
    expect(await listCategories()).toHaveLength(1);

    for (const key of keys) {
      expect(await cacheRedis.get(key)).not.toBe(corrupted);
    }
  });
});
