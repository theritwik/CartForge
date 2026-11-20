import { randomUUID } from 'node:crypto';
import { truncateAllTables } from '@cartforge/db/testing';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  app,
  resetRedisState,
  del,
  patch,
  post,
  signUp,
  type SignedUpUser,
} from '../../../tests/auth-helpers.js';
import { prisma } from '../../lib/prisma.js';
import { redis } from '../../lib/redis.js';
import { confirmOrderPayment, expireOverdueOrders } from '../orders/orders.service.js';

const UNKNOWN_ID = '01900000-0000-7000-8000-000000000000';
const address = {
  name: 'Asha Rao',
  phone: '9876543210',
  addressLine1: '12 MG Road',
  city: 'Bengaluru',
  state: 'Karnataka',
  postalCode: '560001',
};

let admin: SignedUpUser;
let customer: SignedUpUser;
let kitchen: { id: string };
let books: { id: string };
let kettle: { id: string };

function asAdmin(
  method: 'get' | 'post' | 'patch' | 'delete',
  path: string,
  as: SignedUpUser = admin,
) {
  const url = `/api/v1/admin${path}`;
  const call =
    method === 'get'
      ? request(app).get(url)
      : method === 'post'
        ? post(url)
        : method === 'patch'
          ? patch(url)
          : del(url);
  return call.set('Cookie', as.cookie);
}

function stockOf(productId: string) {
  return prisma.product.findUniqueOrThrow({
    where: { id: productId },
    select: { stockQuantity: true, reservedQuantity: true },
  });
}

const newProduct = (overrides: Record<string, unknown> = {}) => ({
  name: 'Copper Bottle',
  slug: 'copper-bottle',
  description: 'A one-litre copper water bottle.',
  pricePaise: 129_900,
  categoryId: kitchen.id,
  status: 'ACTIVE',
  stockQuantity: 12,
  ...overrides,
});

/** Places an order through the storefront, which reserves stock as a customer would. */
async function placeOrder(
  as: SignedUpUser,
  productId: string,
  quantity: number,
  pricePaise: number,
) {
  await post('/api/v1/cart/items').set('Cookie', as.cookie).send({ productId, quantity });
  const response = await post('/api/v1/orders')
    .set('Cookie', as.cookie)
    .set('Idempotency-Key', randomUUID())
    .send({ shippingAddress: address, expectedTotalPaise: pricePaise * quantity });
  if (response.status !== 201) {
    throw new Error(`Checkout failed with status ${response.status}`);
  }
  return (response.body as { data: { id: string } }).data.id;
}

/** Simulates a confirmed payment the way the webhook would leave the database. */
async function markPaid(orderId: string) {
  await prisma.$transaction((tx) => confirmOrderPayment(tx, orderId));
}

beforeAll(async () => {
  await redis.connect();
});

beforeEach(async () => {
  await truncateAllTables(prisma);
  await resetRedisState();
  kitchen = await prisma.category.create({ data: { name: 'Kitchen', slug: 'kitchen' } });
  books = await prisma.category.create({ data: { name: 'Books', slug: 'books' } });
  kettle = await prisma.product.create({
    data: {
      name: 'Steel Kettle',
      slug: 'steel-kettle',
      description: 'Kettle for tests.',
      pricePaise: 150_000,
      stockQuantity: 10,
      status: 'ACTIVE',
      categoryId: kitchen.id,
    },
  });
  admin = await signUp();
  customer = await signUp();
  await prisma.user.update({ where: { id: admin.id }, data: { role: 'ADMIN' } });
});

afterAll(async () => {
  await redis.close();
  await prisma.$disconnect();
});

describe('access', () => {
  const endpoints = [
    ['get', '/dashboard'],
    ['get', '/products'],
    ['post', '/products'],
    ['get', `/products/${UNKNOWN_ID}`],
    ['patch', `/products/${UNKNOWN_ID}`],
    ['get', `/products/${UNKNOWN_ID}/stock-adjustments`],
    ['post', `/products/${UNKNOWN_ID}/stock-adjustments`],
    ['get', '/categories'],
    ['post', '/categories'],
    ['patch', `/categories/${UNKNOWN_ID}`],
    ['delete', `/categories/${UNKNOWN_ID}`],
    ['get', '/orders'],
    ['get', `/orders/${UNKNOWN_ID}`],
    ['post', `/orders/${UNKNOWN_ID}/transitions`],
  ] as const;

  it.each(endpoints)('forbids a customer: %s %s', async (method, path) => {
    const response = await asAdmin(method, path, customer).send({});

    expect(response.status).toBe(403);
    expect(response.body).toEqual({
      error: { code: 'FORBIDDEN', message: 'You do not have permission to do this.' },
    });
  });

  it.each(endpoints)('requires a session: %s %s', async (method, path) => {
    const url = `/api/v1/admin${path}`;
    const response = await (method === 'get' ? request(app).get(url) : request(app)[method](url))
      .set('Origin', 'http://localhost:3000')
      .send({});

    expect(response.status).toBe(401);
  });

  it('lets an administrator in', async () => {
    const response = await asAdmin('get', '/dashboard');

    expect(response.status).toBe(200);
    expect(response.get('Cache-Control')).toBe('no-store');
  });

  it("rejects an administrator's change that does not come from the web app origin", async () => {
    const response = await request(app)
      .post('/api/v1/admin/products')
      .set('Origin', 'https://evil.example')
      .set('Cookie', admin.cookie)
      .send(newProduct());

    expect(response.status).toBe(403);
    expect(await prisma.product.count()).toBe(1);
  });

  it('stops working as soon as an administrator is demoted', async () => {
    await prisma.user.update({ where: { id: admin.id }, data: { role: 'CUSTOMER' } });

    expect((await asAdmin('get', '/dashboard')).status).toBe(403);
  });

  it('never returns password hashes', async () => {
    const order = await placeOrder(customer, kettle.id, 1, 150_000);

    const responses = await Promise.all([
      asAdmin('get', '/orders'),
      asAdmin('get', `/orders/${order}`),
      asAdmin('get', '/dashboard'),
    ]);

    for (const response of responses) {
      expect(JSON.stringify(response.body)).not.toMatch(/passwordHash|password_hash|\$argon2/);
    }
  });
});

describe('products', () => {
  it('creates a product with its price in paise', async () => {
    const response = await asAdmin('post', '/products').send(newProduct());

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      data: {
        name: 'Copper Bottle',
        slug: 'copper-bottle',
        pricePaise: 129_900,
        status: 'ACTIVE',
        stockQuantity: 12,
        reservedQuantity: 0,
        availableQuantity: 12,
        category: { id: kitchen.id, name: 'Kitchen' },
      },
    });
  });

  it('accepts the longest description the form allows, in any script', async () => {
    // 5,000 characters of Devanagari is about 15 KB of UTF-8.
    const description = 'क'.repeat(5000);

    const response = await asAdmin('post', '/products').send(newProduct({ description }));

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({ data: { description } });
  });

  it('still rejects request bodies far larger than any valid product', async () => {
    const response = await asAdmin('post', '/products').send(
      newProduct({ description: 'x'.repeat(100_000) }),
    );

    expect(response.status).toBe(413);
    expect(response.body).toMatchObject({ error: { code: 'PAYLOAD_TOO_LARGE' } });
  });

  it('creates a draft with no stock by default', async () => {
    const response = await asAdmin('post', '/products').send(
      newProduct({ status: undefined, stockQuantity: undefined }),
    );

    expect(response.body).toMatchObject({ data: { status: 'DRAFT', stockQuantity: 0 } });
  });

  it.each([
    ['a price in rupees with decimals', { pricePaise: 1299.5 }],
    ['a negative price', { pricePaise: -100 }],
    ['a price below one rupee', { pricePaise: 99 }],
    ['a price sent as text', { pricePaise: '129900' }],
    ['an absurd price', { pricePaise: 1_000_000_001 }],
  ])('rejects %s', async (_description, override) => {
    const response = await asAdmin('post', '/products').send(newProduct(override));
    const body = response.body as { error: { code: string; details: { path: string }[] } };

    expect(response.status).toBe(400);
    expect(body.error.details.map((detail) => detail.path)).toEqual(['pricePaise']);
    expect(await prisma.product.count()).toBe(1);
  });

  it.each([
    ['name', { name: '  ' }],
    ['slug', { slug: 'Not A Slug' }],
    ['description', { description: '' }],
    ['categoryId', { categoryId: 'kitchen' }],
    ['status', { status: 'SOLD_OUT' }],
    ['stockQuantity', { stockQuantity: -1 }],
  ])('rejects an invalid %s', async (path, override) => {
    const response = await asAdmin('post', '/products').send(newProduct(override));
    const body = response.body as { error: { details: { path: string }[] } };

    expect(response.status).toBe(400);
    expect(body.error.details.map((detail) => detail.path)).toEqual([path]);
  });

  it('rejects a category that does not exist', async () => {
    const response = await asAdmin('post', '/products').send(
      newProduct({ categoryId: UNKNOWN_ID }),
    );

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ error: { details: [{ path: 'categoryId' }] } });
  });

  it('rejects a slug another product already uses', async () => {
    const response = await asAdmin('post', '/products').send(newProduct({ slug: 'steel-kettle' }));

    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({
      error: { code: 'ALREADY_EXISTS', details: [{ path: 'slug' }] },
    });
  });

  it('edits catalog fields and ignores fields it does not manage', async () => {
    const response = await asAdmin('patch', `/products/${kettle.id}`).send({
      name: 'Steel Kettle, 1.5 L',
      pricePaise: 165_000,
      categoryId: books.id,
      reservedQuantity: 9,
      stockQuantity: 999,
      id: UNKNOWN_ID,
    });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      data: {
        id: kettle.id,
        name: 'Steel Kettle, 1.5 L',
        pricePaise: 165_000,
        category: { id: books.id },
        stockQuantity: 10,
        reservedQuantity: 0,
      },
    });
  });

  it('shows the change on the public storefront', async () => {
    await asAdmin('patch', `/products/${kettle.id}`).send({
      name: 'Renamed Kettle',
      pricePaise: 175_000,
    });

    const storefront = await request(app).get('/api/v1/products/steel-kettle');

    expect(storefront.body).toMatchObject({
      data: { name: 'Renamed Kettle', pricePaise: 175_000 },
    });
  });

  it('does not change what past orders recorded', async () => {
    const orderId = await placeOrder(customer, kettle.id, 2, 150_000);

    await asAdmin('patch', `/products/${kettle.id}`).send({
      name: 'Renamed Kettle',
      pricePaise: 999_900,
    });
    const order = await request(app)
      .get(`/api/v1/orders/${orderId}`)
      .set('Cookie', customer.cookie);

    expect(order.body).toMatchObject({
      data: {
        totalPaise: 300_000,
        items: [{ productName: 'Steel Kettle', unitPricePaise: 150_000 }],
      },
    });
  });

  it('rejects an empty update', async () => {
    expect((await asAdmin('patch', `/products/${kettle.id}`).send({})).status).toBe(400);
  });

  it('returns 404 for a product that does not exist', async () => {
    expect((await asAdmin('patch', `/products/${UNKNOWN_ID}`).send({ name: 'x' })).status).toBe(
      404,
    );
  });

  describe('archiving', () => {
    it('hides an archived product from the storefront and brings it back on reactivation', async () => {
      const archive = await asAdmin('patch', `/products/${kettle.id}`).send({ status: 'ARCHIVED' });
      const whileArchived = await request(app).get('/api/v1/products/steel-kettle');
      await asAdmin('patch', `/products/${kettle.id}`).send({ status: 'ACTIVE' });
      const afterReactivation = await request(app).get('/api/v1/products/steel-kettle');

      expect(archive.body).toMatchObject({ data: { status: 'ARCHIVED' } });
      expect(whileArchived.status).toBe(404);
      expect(afterReactivation.status).toBe(200);
    });

    it('flags the product in carts instead of deleting it', async () => {
      await post('/api/v1/cart/items')
        .set('Cookie', customer.cookie)
        .send({ productId: kettle.id });

      await asAdmin('patch', `/products/${kettle.id}`).send({ status: 'ARCHIVED' });
      const cart = await request(app).get('/api/v1/cart').set('Cookie', customer.cookie);

      expect(cart.body).toMatchObject({ data: { items: [{ availability: 'UNAVAILABLE' }] } });
    });

    it('keeps the stock reserved by orders placed before archiving', async () => {
      await placeOrder(customer, kettle.id, 3, 150_000);

      await asAdmin('patch', `/products/${kettle.id}`).send({ status: 'ARCHIVED' });

      expect(await stockOf(kettle.id)).toEqual({ stockQuantity: 10, reservedQuantity: 3 });
    });
  });

  describe('listing', () => {
    beforeEach(async () => {
      await prisma.product.createMany({
        data: [
          {
            name: 'Draft Mixer',
            slug: 'draft-mixer',
            description: 'd',
            pricePaise: 100,
            status: 'DRAFT',
            stockQuantity: 50,
            categoryId: kitchen.id,
          },
          {
            name: 'Old Atlas',
            slug: 'old-atlas',
            description: 'd',
            pricePaise: 100,
            status: 'ARCHIVED',
            stockQuantity: 0,
            categoryId: books.id,
          },
          {
            name: 'Last Lamp',
            slug: 'last-lamp',
            description: 'd',
            pricePaise: 100,
            status: 'ACTIVE',
            stockQuantity: 2,
            categoryId: kitchen.id,
          },
        ],
      });
    });

    const names = (response: request.Response) =>
      (response.body as { data: { name: string }[] }).data.map((product) => product.name).sort();

    it('includes products in every status', async () => {
      expect(names(await asAdmin('get', '/products'))).toEqual([
        'Draft Mixer',
        'Last Lamp',
        'Old Atlas',
        'Steel Kettle',
      ]);
    });

    it('filters by status, category, search, and low stock', async () => {
      expect(names(await asAdmin('get', '/products?status=DRAFT'))).toEqual(['Draft Mixer']);
      expect(names(await asAdmin('get', `/products?categoryId=${books.id}`))).toEqual([
        'Old Atlas',
      ]);
      expect(names(await asAdmin('get', '/products?q=lamp'))).toEqual(['Last Lamp']);
      expect(names(await asAdmin('get', '/products?lowStock=true'))).toEqual(['Last Lamp']);
    });

    it.each(['pageSize=101', 'page=0', 'status=GONE', 'lowStock=yes', 'categoryId=1'])(
      'rejects the query %s',
      async (query) => {
        expect((await asAdmin('get', `/products?${query}`)).status).toBe(400);
      },
    );
  });
});

describe('categories', () => {
  it('creates and renames a category', async () => {
    const created = await asAdmin('post', '/categories').send({ name: 'Garden', slug: 'garden' });
    const id = (created.body as { data: { id: string } }).data.id;
    const renamed = await asAdmin('patch', `/categories/${id}`).send({
      name: 'Garden & Outdoors',
      slug: 'garden-outdoors',
    });

    expect(created.status).toBe(201);
    expect(renamed.body).toMatchObject({
      data: { name: 'Garden & Outdoors', slug: 'garden-outdoors' },
    });
  });

  it.each([
    ['name', { name: 'Kitchen', slug: 'kitchen-2' }],
    ['slug', { name: 'Kitchenware', slug: 'kitchen' }],
  ])('rejects a %s another category uses', async (field, body) => {
    const response = await asAdmin('post', '/categories').send(body);

    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({
      error: { code: 'ALREADY_EXISTS', details: [{ path: field }] },
    });
  });

  it("rejects renaming onto another category's slug", async () => {
    const response = await asAdmin('patch', `/categories/${books.id}`).send({ slug: 'kitchen' });

    expect(response.status).toBe(409);
  });

  it('lists categories with all products and active products counted', async () => {
    await prisma.product.create({
      data: {
        name: 'Draft Mixer',
        slug: 'draft-mixer',
        description: 'd',
        pricePaise: 100,
        status: 'DRAFT',
        categoryId: kitchen.id,
      },
    });

    const response = await asAdmin('get', '/categories');

    expect(response.body).toMatchObject({
      data: [
        { name: 'Books', productCount: 0, activeProductCount: 0 },
        { name: 'Kitchen', productCount: 2, activeProductCount: 1 },
      ],
    });
  });

  it('deletes an empty category', async () => {
    const response = await asAdmin('delete', `/categories/${books.id}`);

    expect(response.status).toBe(204);
    expect(await prisma.category.count()).toBe(1);
  });

  it('refuses to delete a category that still has products, even archived ones', async () => {
    await prisma.product.update({ where: { id: kettle.id }, data: { status: 'ARCHIVED' } });

    const response = await asAdmin('delete', `/categories/${kitchen.id}`);

    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({
      error: { code: 'CATEGORY_HAS_PRODUCTS', details: { productCount: 1 } },
    });
    expect(await prisma.category.count()).toBe(2);
  });
});

describe('stock adjustments', () => {
  function adjust(delta: unknown, productId = kettle.id) {
    return asAdmin('post', `/products/${productId}/stock-adjustments`).send({ delta });
  }

  it('adds and removes physical stock', async () => {
    const added = await adjust(15);
    const removed = await adjust(-5);

    expect(added.body).toMatchObject({ data: { stockQuantity: 25, availableQuantity: 25 } });
    expect(removed.body).toMatchObject({ data: { stockQuantity: 20 } });
  });

  it.each([0, 1.5, '5', null, 100_001])('rejects the change %j', async (delta) => {
    expect((await adjust(delta)).status).toBe(400);
    expect(await stockOf(kettle.id)).toEqual({ stockQuantity: 10, reservedQuantity: 0 });
  });

  it('refuses to take stock below what unpaid orders have reserved', async () => {
    await placeOrder(customer, kettle.id, 4, 150_000);

    const tooFar = await adjust(-7);
    const toTheLimit = await adjust(-6);

    expect(tooFar.status).toBe(409);
    expect(tooFar.body).toMatchObject({
      error: { code: 'STOCK_BELOW_RESERVED', details: { stockQuantity: 10, reservedQuantity: 4 } },
    });
    expect(toTheLimit.status).toBe(200);
    expect(await stockOf(kettle.id)).toEqual({ stockQuantity: 4, reservedQuantity: 4 });
  });

  it('refuses to take stock below zero', async () => {
    const response = await adjust(-11);

    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({
      error: {
        code: 'STOCK_BELOW_ZERO',
        message: 'Only 10 units are in stock, so at most 10 can be removed.',
      },
    });
  });

  it('refuses to exceed the stock limit', async () => {
    await prisma.product.update({ where: { id: kettle.id }, data: { stockQuantity: 999_990 } });

    const response = await adjust(20);

    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({ error: { code: 'STOCK_LIMIT_EXCEEDED' } });
  });

  it('returns 404 for a product that does not exist', async () => {
    expect((await adjust(5, UNKNOWN_ID)).status).toBe(404);
  });

  it('applies every concurrent adjustment exactly once', async () => {
    const responses = await Promise.all([
      ...Array.from({ length: 10 }, () => adjust(3)),
      ...Array.from({ length: 5 }, () => adjust(-2)),
    ]);

    expect(responses.every((response) => response.status === 200)).toBe(true);
    expect(await stockOf(kettle.id)).toEqual({ stockQuantity: 30, reservedQuantity: 0 });
  });

  it('never lets stock fall below reservations while customers check out concurrently', async () => {
    const shoppers = await Promise.all(Array.from({ length: 4 }, () => signUp()));
    for (const shopper of shoppers) {
      await post('/api/v1/cart/items')
        .set('Cookie', shopper.cookie)
        .send({ productId: kettle.id, quantity: 2 });
    }

    await Promise.all([
      ...shoppers.map((shopper) =>
        post('/api/v1/orders')
          .set('Cookie', shopper.cookie)
          .set('Idempotency-Key', randomUUID())
          .send({ shippingAddress: address, expectedTotalPaise: 300_000 }),
      ),
      adjust(-4),
      adjust(-4),
    ]);

    const stock = await stockOf(kettle.id);
    expect(stock.stockQuantity).toBeGreaterThanOrEqual(stock.reservedQuantity);
    expect(stock.reservedQuantity).toBe(
      2 * (await prisma.order.count({ where: { status: 'PENDING_PAYMENT' } })),
    );
  });

  describe('history', () => {
    const history = (productId = kettle.id) =>
      asAdmin('get', `/products/${productId}/stock-adjustments`);

    it('records who changed the stock, by how much, why, and the stock afterwards', async () => {
      await asAdmin('post', `/products/${kettle.id}/stock-adjustments`).send({
        delta: 15,
        reason: '  Delivery from supplier  ',
      });
      await asAdmin('post', `/products/${kettle.id}/stock-adjustments`).send({ delta: -3 });

      const response = await history();

      expect(response.status).toBe(200);
      expect((response.body as { data: unknown[] }).data).toEqual([
        expect.objectContaining({ delta: -3, stockAfter: 22, reason: null }),
        expect.objectContaining({
          delta: 15,
          stockAfter: 25,
          reason: 'Delivery from supplier',
          admin: { id: admin.id, name: 'Asha Rao', email: admin.email },
        }),
      ]);
      expect(JSON.stringify(response.body)).not.toContain('passwordHash');
    });

    it('records nothing for a refused or invalid adjustment', async () => {
      await asAdmin('post', `/products/${kettle.id}/stock-adjustments`).send({ delta: -11 });
      const tooLong = await asAdmin('post', `/products/${kettle.id}/stock-adjustments`).send({
        delta: 1,
        reason: 'x'.repeat(201),
      });

      expect(tooLong.status).toBe(400);
      expect(((await history()).body as { data: unknown[] }).data).toEqual([]);
      expect(await prisma.stockAdjustment.count()).toBe(0);
    });

    it('records each concurrent adjustment once, with a consistent stock after each', async () => {
      await Promise.all(
        Array.from({ length: 10 }, () =>
          asAdmin('post', `/products/${kettle.id}/stock-adjustments`).send({ delta: 2 }),
        ),
      );

      const rows = await prisma.stockAdjustment.findMany({ where: { productId: kettle.id } });
      expect(rows).toHaveLength(10);
      // The changes were applied one after another: 12, 14, ... 30.
      expect(rows.map((row) => row.stockAfter).sort((a, b) => a - b)).toEqual(
        Array.from({ length: 10 }, (_, index) => 12 + index * 2),
      );
      expect(await stockOf(kettle.id)).toEqual({ stockQuantity: 30, reservedQuantity: 0 });
    });

    it('cannot be altered once written', async () => {
      await asAdmin('post', `/products/${kettle.id}/stock-adjustments`).send({ delta: 1 });

      await expect(prisma.$executeRaw`UPDATE stock_adjustments SET delta = 100`).rejects.toThrow(
        /immutable/,
      );
    });

    it('returns 404 for a product that does not exist', async () => {
      expect((await history(UNKNOWN_ID)).status).toBe(404);
    });
  });
});

describe('orders', () => {
  describe('listing', () => {
    let pendingOrder: string;
    let paidOrder: string;

    beforeEach(async () => {
      pendingOrder = await placeOrder(customer, kettle.id, 1, 150_000);
      paidOrder = await placeOrder(customer, kettle.id, 2, 150_000);
      await markPaid(paidOrder);
    });

    const ids = (response: request.Response) =>
      (response.body as { data: { id: string }[] }).data.map((order) => order.id);

    it("lists every customer's orders with the customer, newest first", async () => {
      const other = await signUp();
      const othersOrder = await placeOrder(other, kettle.id, 1, 150_000);

      const response = await asAdmin('get', '/orders');

      expect(ids(response)).toEqual([othersOrder, paidOrder, pendingOrder]);
      expect(response.body).toMatchObject({
        data: [{ user: { email: other.email }, itemCount: 1 }, {}, {}],
        meta: { totalItems: 3 },
      });
    });

    it('filters by status', async () => {
      expect(ids(await asAdmin('get', '/orders?status=PAID'))).toEqual([paidOrder]);
      expect(ids(await asAdmin('get', '/orders?status=PENDING_PAYMENT'))).toEqual([pendingOrder]);
      expect(ids(await asAdmin('get', '/orders?status=DELIVERED'))).toEqual([]);
    });

    it('finds an order by the short reference customers see, or the full id', async () => {
      const shortReference = `#${paidOrder.slice(-8).toUpperCase()}`;

      expect(
        ids(await asAdmin('get', `/orders?reference=${encodeURIComponent(shortReference)}`)),
      ).toEqual([paidOrder]);
      expect(ids(await asAdmin('get', `/orders?reference=${paidOrder}`))).toEqual([paidOrder]);
    });

    it('finds orders by customer email', async () => {
      expect(
        ids(await asAdmin('get', `/orders?email=${customer.email.toUpperCase()}`)),
      ).toHaveLength(2);
    });

    it('shows an overdue order as expired', async () => {
      await prisma.order.update({
        where: { id: pendingOrder },
        data: { reservationExpiresAt: new Date(Date.now() - 1000) },
      });

      expect(ids(await asAdmin('get', '/orders?status=EXPIRED'))).toEqual([pendingOrder]);
      expect(await stockOf(kettle.id)).toEqual({ stockQuantity: 8, reservedQuantity: 0 });
    });

    it.each(['reference=%25', 'reference=ab', 'reference=zzzz', 'status=LOST', 'pageSize=500'])(
      'rejects the query %s',
      async (query) => {
        expect((await asAdmin('get', `/orders?${query}`)).status).toBe(400);
      },
    );
  });

  describe('details', () => {
    it('shows items, shipping, customer, payments, and the allowed next steps', async () => {
      const orderId = await placeOrder(customer, kettle.id, 2, 150_000);
      await prisma.payment.create({
        data: {
          orderId,
          amountPaise: 300_000,
          status: 'REFUND_PENDING',
          failureReason: 'ORDER_NOT_AWAITING_PAYMENT',
          stripePaymentIntentId: 'pi_test_admin_view',
          checkoutUrl: 'https://checkout.stripe.test/secret-page',
          checkoutExpiresAt: new Date(),
        },
      });

      const response = await asAdmin('get', `/orders/${orderId}`);

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        data: {
          status: 'PENDING_PAYMENT',
          totalPaise: 300_000,
          shippingName: 'Asha Rao',
          shippingPostalCode: '560001',
          user: { id: customer.id, email: customer.email },
          items: [{ productName: 'Steel Kettle', quantity: 2, lineTotalPaise: 300_000 }],
          payments: [
            {
              status: 'REFUND_PENDING',
              failureReason: 'ORDER_NOT_AWAITING_PAYMENT',
              stripePaymentIntentId: 'pi_test_admin_view',
            },
          ],
          allowedTransitions: ['CANCELLED'],
        },
      });
      expect(JSON.stringify(response.body)).not.toContain('secret-page');
    });

    it("keeps payment details from customers, including the order's owner", async () => {
      const orderId = await placeOrder(customer, kettle.id, 1, 150_000);
      await prisma.payment.create({
        data: {
          orderId,
          amountPaise: 150_000,
          status: 'FAILED',
          failureReason: 'PAYMENT_FAILED',
          stripePaymentIntentId: 'pi_test_hidden',
          checkoutExpiresAt: new Date(),
        },
      });

      const adminView = await asAdmin('get', `/orders/${orderId}`, customer);
      const ownView = await request(app)
        .get(`/api/v1/orders/${orderId}`)
        .set('Cookie', customer.cookie);

      expect(adminView.status).toBe(403);
      expect(ownView.body).toMatchObject({ data: { payments: [{ status: 'FAILED' }] } });
      expect(JSON.stringify(ownView.body)).not.toMatch(/pi_test_hidden|PAYMENT_FAILED/);
    });

    it('returns 404 for an order that does not exist', async () => {
      expect((await asAdmin('get', `/orders/${UNKNOWN_ID}`)).status).toBe(404);
    });
  });

  describe('status transitions', () => {
    function transition(orderId: string, from: string, to: string) {
      return asAdmin('post', `/orders/${orderId}/transitions`).send({ from, to });
    }

    async function paidOrder() {
      const orderId = await placeOrder(customer, kettle.id, 2, 150_000);
      await markPaid(orderId);
      return orderId;
    }

    it('moves a paid order through fulfilment without touching stock', async () => {
      const orderId = await paidOrder();
      const afterPayment = await stockOf(kettle.id);

      const steps = [
        await transition(orderId, 'PAID', 'PROCESSING'),
        await transition(orderId, 'PROCESSING', 'SHIPPED'),
        await transition(orderId, 'SHIPPED', 'DELIVERED'),
      ];

      expect(steps.map((step) => step.status)).toEqual([200, 200, 200]);
      expect(
        steps.map(
          (step) =>
            (step.body as { data: { allowedTransitions: string[] } }).data.allowedTransitions,
        ),
      ).toEqual([['SHIPPED'], ['DELIVERED'], []]);
      expect(afterPayment).toEqual({ stockQuantity: 8, reservedQuantity: 0 });
      expect(await stockOf(kettle.id)).toEqual(afterPayment);
    });

    it('shows the new status to the customer', async () => {
      const orderId = await paidOrder();
      await transition(orderId, 'PAID', 'PROCESSING');

      const order = await request(app)
        .get(`/api/v1/orders/${orderId}`)
        .set('Cookie', customer.cookie);

      expect(order.body).toMatchObject({ data: { status: 'PROCESSING' } });
    });

    it('cancels an unpaid order and returns its stock', async () => {
      const orderId = await placeOrder(customer, kettle.id, 3, 150_000);

      const response = await transition(orderId, 'PENDING_PAYMENT', 'CANCELLED');

      expect(response.body).toMatchObject({
        data: { status: 'CANCELLED', allowedTransitions: [] },
      });
      expect(await stockOf(kettle.id)).toEqual({ stockQuantity: 10, reservedQuantity: 0 });
    });

    it.each([
      ['PENDING_PAYMENT', 'PAID'],
      ['PENDING_PAYMENT', 'SHIPPED'],
      ['PENDING_PAYMENT', 'DELIVERED'],
      ['PENDING_PAYMENT', 'EXPIRED'],
      ['PENDING_PAYMENT', 'REFUNDED'],
    ])('never moves an unpaid order from %s to %s', async (from, to) => {
      const orderId = await placeOrder(customer, kettle.id, 2, 150_000);

      const response = await transition(orderId, from, to);

      expect(response.status).toBe(409);
      expect(response.body).toMatchObject({
        error: { code: 'TRANSITION_NOT_ALLOWED', details: { allowedTransitions: ['CANCELLED'] } },
      });
      expect(await prisma.order.findUniqueOrThrow({ where: { id: orderId } })).toMatchObject({
        status: 'PENDING_PAYMENT',
      });
      expect(await stockOf(kettle.id)).toEqual({ stockQuantity: 10, reservedQuantity: 2 });
    });

    it.each([
      ['PAID', 'CANCELLED'],
      ['PAID', 'SHIPPED'],
      ['PAID', 'PENDING_PAYMENT'],
      ['PAID', 'REFUNDED'],
      ['PROCESSING', 'PAID'],
      ['DELIVERED', 'SHIPPED'],
      ['CANCELLED', 'PENDING_PAYMENT'],
      ['EXPIRED', 'PAID'],
    ])('refuses %s to %s', async (from, to) => {
      const orderId = await paidOrder();
      await prisma.order.update({ where: { id: orderId }, data: { status: from as 'PAID' } });

      const response = await transition(orderId, from, to);

      expect(response.status).toBe(409);
      expect(response.body).toMatchObject({ error: { code: 'TRANSITION_NOT_ALLOWED' } });
      expect(await prisma.order.findUniqueOrThrow({ where: { id: orderId } })).toMatchObject({
        status: from,
      });
    });

    it('refuses a change based on a status the order no longer has', async () => {
      const orderId = await paidOrder();
      await transition(orderId, 'PAID', 'PROCESSING');

      const stale = await transition(orderId, 'PAID', 'PROCESSING');

      expect(stale.status).toBe(409);
      expect(stale.body).toMatchObject({
        error: { code: 'ORDER_STATUS_CHANGED', details: { status: 'PROCESSING' } },
      });
    });

    it('refuses to cancel an order that the webhook marked paid in the meantime', async () => {
      const orderId = await placeOrder(customer, kettle.id, 2, 150_000);
      await markPaid(orderId);

      const response = await transition(orderId, 'PENDING_PAYMENT', 'CANCELLED');

      expect(response.status).toBe(409);
      expect(response.body).toMatchObject({
        error: { code: 'ORDER_STATUS_CHANGED', details: { status: 'PAID' } },
      });
      // The sale stands: stock was not released.
      expect(await stockOf(kettle.id)).toEqual({ stockQuantity: 8, reservedQuantity: 0 });
    });

    it('applies one of two simultaneous transitions, once', async () => {
      const orderId = await paidOrder();

      const responses = await Promise.all([
        transition(orderId, 'PAID', 'PROCESSING'),
        transition(orderId, 'PAID', 'PROCESSING'),
      ]);

      expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
    });

    it('releases stock once when an administrator and the customer cancel at the same time', async () => {
      const orderId = await placeOrder(customer, kettle.id, 3, 150_000);
      await prisma.product.update({ where: { id: kettle.id }, data: { reservedQuantity: 5 } });

      await Promise.all([
        transition(orderId, 'PENDING_PAYMENT', 'CANCELLED'),
        post(`/api/v1/orders/${orderId}/cancel`).set('Cookie', customer.cookie),
      ]);

      expect(await stockOf(kettle.id)).toEqual({ stockQuantity: 10, reservedQuantity: 2 });
    });

    it('rejects an unknown status', async () => {
      const orderId = await paidOrder();

      expect((await transition(orderId, 'PAID', 'LOST')).status).toBe(400);
    });
  });
});

describe('dashboard', () => {
  it('computes every figure from the database', async () => {
    const otherProduct = await prisma.product.create({
      data: {
        name: 'Chef Knife',
        slug: 'chef-knife',
        description: 'd',
        pricePaise: 300_050,
        stockQuantity: 50,
        status: 'ACTIVE',
        categoryId: kitchen.id,
      },
    });
    await prisma.product.create({
      data: {
        name: 'Draft Mixer',
        slug: 'draft-mixer',
        description: 'd',
        pricePaise: 100,
        status: 'DRAFT',
        categoryId: kitchen.id,
      },
    });

    // Two paid orders, one delivered: ₹3,000.00 + ₹3,000.50 of revenue.
    const paid = await placeOrder(customer, kettle.id, 2, 150_000);
    await markPaid(paid);
    const delivered = await placeOrder(customer, otherProduct.id, 1, 300_050);
    await markPaid(delivered);
    await prisma.order.update({ where: { id: delivered }, data: { status: 'DELIVERED' } });
    // Awaiting payment: not revenue.
    const pending = await placeOrder(customer, kettle.id, 3, 150_000);
    // Cancelled and expired: not revenue.
    const cancelled = await placeOrder(customer, kettle.id, 1, 150_000);
    await post(`/api/v1/orders/${cancelled}/cancel`).set('Cookie', customer.cookie);
    const expired = await placeOrder(customer, kettle.id, 1, 150_000);
    await prisma.order.update({
      where: { id: expired },
      data: { reservationExpiresAt: new Date(Date.now() - 1000) },
    });
    await expireOverdueOrders();
    // Money that had to be returned.
    await prisma.payment.createMany({
      data: [
        {
          orderId: expired,
          amountPaise: 150_000,
          status: 'REFUNDED',
          checkoutExpiresAt: new Date(),
        },
        {
          orderId: cancelled,
          amountPaise: 150_000,
          status: 'REFUND_PENDING',
          checkoutExpiresAt: new Date(),
        },
        { orderId: paid, amountPaise: 300_000, status: 'SUCCEEDED', checkoutExpiresAt: new Date() },
      ],
    });

    const response = await asAdmin('get', '/dashboard');
    const dashboard = (response.body as { data: Record<string, unknown> }).data;

    expect(dashboard).toMatchObject({
      sales: {
        revenuePaise: 600_050,
        paidOrderCount: 2,
        awaitingPayment: { count: 1, amountPaise: 450_000 },
        refundPending: { count: 1, amountPaise: 150_000 },
        refunded: { count: 1, amountPaise: 150_000 },
      },
      orders: { total: 5, delivered: 1, cancelled: 1, expired: 1 },
      products: { active: 2, draft: 1, archived: 0, lowStockThreshold: 5, lowStockCount: 1 },
    });
    // Kettle: 10 in stock, 2 sold, 3 reserved by the pending order: 5 available.
    expect(dashboard.products).toMatchObject({
      lowStock: [
        { name: 'Steel Kettle', stockQuantity: 8, reservedQuantity: 3, availableQuantity: 5 },
      ],
    });
    expect((dashboard.orders as { byStatus: unknown[] }).byStatus).toEqual(
      expect.arrayContaining([
        { status: 'PAID', count: 1 },
        { status: 'DELIVERED', count: 1 },
        { status: 'PENDING_PAYMENT', count: 1 },
        { status: 'CANCELLED', count: 1 },
        { status: 'EXPIRED', count: 1 },
      ]),
    );
    expect((dashboard.recentOrders as { id: string }[]).map((order) => order.id)).toEqual([
      expired,
      cancelled,
      pending,
      delivered,
      paid,
    ]);
  });

  it('reports fourteen days of paid sales by order date, including empty days', async () => {
    const orderId = await placeOrder(customer, kettle.id, 2, 150_000);
    await markPaid(orderId);
    const older = await placeOrder(customer, kettle.id, 1, 150_000);
    await markPaid(older);
    await prisma.order.update({
      where: { id: older },
      data: { createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000) },
    });
    // Unpaid orders do not count as sales.
    await placeOrder(customer, kettle.id, 1, 150_000);

    const response = await asAdmin('get', '/dashboard');
    const trend = (
      response.body as {
        data: { salesTrend: { date: string; orderCount: number; revenuePaise: number }[] };
      }
    ).data.salesTrend;

    expect(trend).toHaveLength(14);
    expect(trend.at(-1)).toMatchObject({ orderCount: 1, revenuePaise: 300_000 });
    expect(trend.at(-4)).toMatchObject({ orderCount: 1, revenuePaise: 150_000 });
    expect(trend.reduce((total, day) => total + day.revenuePaise, 0)).toBe(450_000);
    expect(trend.map((day) => day.date)).toEqual([...trend.map((day) => day.date)].sort());
  });

  it('reports zeros for an empty store', async () => {
    await prisma.product.deleteMany();

    const response = await asAdmin('get', '/dashboard');

    expect(response.body).toMatchObject({
      data: {
        sales: {
          revenuePaise: 0,
          paidOrderCount: 0,
          awaitingPayment: { count: 0, amountPaise: 0 },
        },
        orders: { total: 0, byStatus: [] },
        products: { active: 0, lowStock: [] },
        recentOrders: [],
      },
    });
  });
});
