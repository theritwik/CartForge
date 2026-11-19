import { randomUUID } from 'node:crypto';
import { truncateAllTables } from '@cartforge/db/testing';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  app,
  clearRateLimits,
  post,
  signUp,
  type SignedUpUser,
} from '../../../tests/auth-helpers.js';
import { prisma } from '../../lib/prisma.js';
import { redis } from '../../lib/redis.js';
import { confirmOrderPayment, expireOrder, expireOverdueOrders } from './orders.service.js';

interface Order {
  id: string;
  status: string;
  totalPaise: number;
  reservationExpiresAt: string | null;
  shippingAddress: Record<string, string | null>;
  items: {
    productName: string;
    unitPricePaise: number;
    quantity: number;
    lineTotalPaise: number;
  }[];
}

const UNKNOWN_ID = '01900000-0000-7000-8000-000000000000';
const address = {
  name: 'Asha Rao',
  phone: '98765 43210',
  addressLine1: '12 MG Road',
  addressLine2: 'Flat 4B',
  city: 'Bengaluru',
  state: 'Karnataka',
  postalCode: '560001',
};

let categoryId: string;
let kettle: { id: string };
let knife: { id: string };
let user: SignedUpUser;

function createProduct(name: string, pricePaise: number, stockQuantity: number) {
  return prisma.product.create({
    data: {
      name,
      slug: `${name.toLowerCase().replaceAll(' ', '-')}-${randomUUID().slice(0, 8)}`,
      description: `${name} for tests.`,
      pricePaise,
      stockQuantity,
      status: 'ACTIVE',
      categoryId,
    },
  });
}

function stockOf(productId: string) {
  return prisma.product.findUniqueOrThrow({
    where: { id: productId },
    select: { stockQuantity: true, reservedQuantity: true },
  });
}

async function addToCart(as: SignedUpUser, productId: string, quantity = 1) {
  const response = await post('/api/v1/cart/items')
    .set('Cookie', as.cookie)
    .send({ productId, quantity });
  if (response.status !== 200) {
    throw new Error(`Adding to the cart failed with status ${response.status}`);
  }
}

async function cartOf(as: SignedUpUser) {
  const response = await request(app).get('/api/v1/cart').set('Cookie', as.cookie);
  return (response.body as { data: { subtotalPaise: number; items: unknown[] } }).data;
}

/** Sends a checkout request. By default it sends the total the cart currently shows. */
async function checkout(
  as: SignedUpUser,
  options: { key?: string; expectedTotalPaise?: number; shippingAddress?: object } = {},
) {
  const expectedTotalPaise = options.expectedTotalPaise ?? (await cartOf(as)).subtotalPaise;
  return post('/api/v1/orders')
    .set('Cookie', as.cookie)
    .set('Idempotency-Key', options.key ?? randomUUID())
    .send({ shippingAddress: options.shippingAddress ?? address, expectedTotalPaise });
}

function orderIn(response: request.Response): Order {
  return (response.body as { data: Order }).data;
}

async function placeOrder(as: SignedUpUser): Promise<Order> {
  const response = await checkout(as);
  if (response.status !== 201) {
    throw new Error(`Checkout failed with status ${response.status}`);
  }
  return orderIn(response);
}

function getOrder(as: SignedUpUser, orderId: string) {
  return request(app).get(`/api/v1/orders/${orderId}`).set('Cookie', as.cookie);
}

function cancelOrder(as: SignedUpUser, orderId: string) {
  return post(`/api/v1/orders/${orderId}/cancel`).set('Cookie', as.cookie);
}

function confirmPayment(orderId: string) {
  return prisma.$transaction((tx) => confirmOrderPayment(tx, orderId));
}

function makeOverdue(orderId: string) {
  return prisma.order.update({
    where: { id: orderId },
    data: { reservationExpiresAt: new Date(Date.now() - 1000) },
  });
}

beforeAll(async () => {
  await redis.connect();
});

beforeEach(async () => {
  await truncateAllTables(prisma);
  await clearRateLimits();

  const category = await prisma.category.create({ data: { name: 'Kitchen', slug: 'kitchen' } });
  categoryId = category.id;
  kettle = await createProduct('Steel Kettle', 150_000, 5);
  knife = await createProduct('Chef Knife', 300_050, 50);
  user = await signUp();
});

afterAll(async () => {
  await redis.close();
  await prisma.$disconnect();
});

describe('POST /api/v1/orders', () => {
  it('creates an order awaiting payment from the cart, with a snapshot of each item', async () => {
    await addToCart(user, kettle.id, 2);
    await addToCart(user, knife.id, 1);

    const response = await checkout(user);

    expect(response.status).toBe(201);
    expect(orderIn(response)).toMatchObject({
      status: 'PENDING_PAYMENT',
      totalPaise: 600_050,
      shippingAddress: {
        name: 'Asha Rao',
        phone: '+919876543210',
        addressLine1: '12 MG Road',
        addressLine2: 'Flat 4B',
        city: 'Bengaluru',
        state: 'Karnataka',
        postalCode: '560001',
      },
      items: [
        {
          productName: 'Chef Knife',
          unitPricePaise: 300_050,
          quantity: 1,
          lineTotalPaise: 300_050,
        },
        {
          productName: 'Steel Kettle',
          unitPricePaise: 150_000,
          quantity: 2,
          lineTotalPaise: 300_000,
        },
      ],
    });
  });

  it('reserves the stock for 30 minutes and empties the cart', async () => {
    await addToCart(user, kettle.id, 2);

    const order = await placeOrder(user);
    const minutesUntilExpiry =
      (new Date(order.reservationExpiresAt ?? 0).getTime() - Date.now()) / 60_000;

    expect(await stockOf(kettle.id)).toEqual({ stockQuantity: 5, reservedQuantity: 2 });
    expect(minutesUntilExpiry).toBeGreaterThan(29);
    expect(minutesUntilExpiry).toBeLessThanOrEqual(30);
    expect((await cartOf(user)).items).toEqual([]);
  });

  it('keeps the purchase-time name and price when the product changes later', async () => {
    await addToCart(user, kettle.id, 1);
    const order = await placeOrder(user);

    await prisma.product.update({
      where: { id: kettle.id },
      data: { name: 'Renamed Kettle', pricePaise: 999_900 },
    });

    expect(orderIn(await getOrder(user, order.id))).toMatchObject({
      totalPaise: 150_000,
      items: [{ productName: 'Steel Kettle', unitPricePaise: 150_000 }],
    });
  });

  it('rejects checkout with an empty cart', async () => {
    const response = await checkout(user, { expectedTotalPaise: 0 });

    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({ error: { code: 'CART_EMPTY' } });
    expect(await prisma.order.count()).toBe(0);
  });

  it.each([
    ['shippingAddress.name', { name: '  ' }],
    ['shippingAddress.phone', { phone: '12345' }],
    ['shippingAddress.phone', { phone: '5876543210' }],
    ['shippingAddress.addressLine1', { addressLine1: undefined }],
    ['shippingAddress.city', { city: '' }],
    ['shippingAddress.state', { state: 'x'.repeat(101) }],
    ['shippingAddress.postalCode', { postalCode: '56001' }],
    ['shippingAddress.postalCode', { postalCode: '060001' }],
  ])('rejects an invalid %s and reserves nothing', async (path, override) => {
    await addToCart(user, kettle.id, 1);

    const response = await checkout(user, { shippingAddress: { ...address, ...override } });
    const body = response.body as { error: { code: string; details: { path: string }[] } };

    expect(response.status).toBe(400);
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.details.map((detail) => detail.path)).toEqual([path]);
    expect(await stockOf(kettle.id)).toMatchObject({ reservedQuantity: 0 });
  });

  it('accepts an address without a second line', async () => {
    await addToCart(user, kettle.id, 1);

    const response = await checkout(user, {
      shippingAddress: { ...address, addressLine2: undefined },
    });

    expect(orderIn(response).shippingAddress.addressLine2).toBeNull();
  });

  it.each([
    ['missing', undefined],
    ['not a UUID', 'order-1'],
  ])('rejects an Idempotency-Key that is %s', async (_description, key) => {
    await addToCart(user, kettle.id, 1);
    const checkoutRequest = post('/api/v1/orders').set('Cookie', user.cookie);
    if (key) {
      void checkoutRequest.set('Idempotency-Key', key);
    }

    const response = await checkoutRequest.send({
      shippingAddress: address,
      expectedTotalPaise: 150_000,
    });

    expect(response.status).toBe(400);
    expect(await prisma.order.count()).toBe(0);
  });

  describe('prices', () => {
    it('refuses the order when a price changed after the customer saw the total', async () => {
      await addToCart(user, kettle.id, 2);
      const totalShown = (await cartOf(user)).subtotalPaise;
      await prisma.product.update({ where: { id: kettle.id }, data: { pricePaise: 175_000 } });

      const response = await checkout(user, { expectedTotalPaise: totalShown });

      expect(response.status).toBe(409);
      expect(response.body).toMatchObject({
        error: { code: 'CART_CHANGED', details: { totalPaise: 350_000 } },
      });
      expect(await prisma.order.count()).toBe(0);
      expect(await stockOf(kettle.id)).toMatchObject({ reservedQuantity: 0 });
      expect((await cartOf(user)).items).toHaveLength(1);
    });

    it('charges the current database price once the customer accepts the new total', async () => {
      await addToCart(user, kettle.id, 2);
      await prisma.product.update({ where: { id: kettle.id }, data: { pricePaise: 175_000 } });

      const order = await placeOrder(user);

      expect(order).toMatchObject({
        totalPaise: 350_000,
        items: [{ unitPricePaise: 175_000, lineTotalPaise: 350_000 }],
      });
    });

    it('never uses a total supplied by the client as the amount', async () => {
      await addToCart(user, kettle.id, 2);

      const response = await checkout(user, { expectedTotalPaise: 1 });

      expect(response.status).toBe(409);
      expect(await prisma.order.count()).toBe(0);
    });
  });

  describe('availability', () => {
    it('refuses the order when a product was withdrawn, and keeps the cart', async () => {
      await addToCart(user, kettle.id, 1);
      await addToCart(user, knife.id, 1);
      await prisma.product.update({ where: { id: kettle.id }, data: { status: 'ARCHIVED' } });

      const response = await checkout(user, { expectedTotalPaise: 450_050 });

      expect(response.status).toBe(409);
      expect(response.body).toMatchObject({
        error: {
          code: 'ITEMS_UNAVAILABLE',
          details: { items: [{ productId: kettle.id, availability: 'UNAVAILABLE' }] },
        },
      });
      expect((await cartOf(user)).items).toHaveLength(2);
    });

    it('refuses the order when stock fell below the quantity in the cart', async () => {
      await addToCart(user, kettle.id, 4);
      await prisma.product.update({ where: { id: kettle.id }, data: { stockQuantity: 3 } });

      const response = await checkout(user, { expectedTotalPaise: 600_000 });

      expect(response.status).toBe(409);
      expect(response.body).toMatchObject({
        error: {
          code: 'ITEMS_UNAVAILABLE',
          details: {
            items: [
              { name: 'Steel Kettle', availability: 'INSUFFICIENT_STOCK', availableQuantity: 3 },
            ],
          },
        },
      });
      expect(await stockOf(kettle.id)).toEqual({ stockQuantity: 3, reservedQuantity: 0 });
    });

    it.each([
      ['the first product by lock order', 0],
      ['the second product by lock order', 1],
    ])('rolls back every reservation when %s cannot be reserved', async (_description, failing) => {
      const products = [kettle, knife].toSorted((a, b) => a.id.localeCompare(b.id));
      const unavailable = products[failing];
      const available = products[1 - failing];
      if (!unavailable || !available) {
        throw new Error('Test products are missing.');
      }
      await addToCart(user, kettle.id, 2);
      await addToCart(user, knife.id, 2);
      const totalShown = (await cartOf(user)).subtotalPaise;
      await prisma.product.update({ where: { id: unavailable.id }, data: { stockQuantity: 1 } });

      const response = await checkout(user, { expectedTotalPaise: totalShown });

      expect(response.status).toBe(409);
      expect(await stockOf(available.id)).toMatchObject({ reservedQuantity: 0 });
      expect(await stockOf(unavailable.id)).toMatchObject({ reservedQuantity: 0 });
      expect(await prisma.order.count()).toBe(0);
      expect(await prisma.orderItem.count()).toBe(0);
      expect((await cartOf(user)).items).toHaveLength(2);
    });
  });
});

describe('concurrent checkouts', () => {
  it('lets exactly one of two customers buy the last unit', async () => {
    const otherUser = await signUp();
    // Repeated with fresh products to give the race several chances to go wrong.
    for (let round = 0; round < 5; round += 1) {
      const lastUnit = await createProduct(`Limited Lamp ${round}`, 99_900, 1);
      await addToCart(user, lastUnit.id);
      await addToCart(otherUser, lastUnit.id);

      const responses = await Promise.all([
        checkout(user, { expectedTotalPaise: 99_900 }),
        checkout(otherUser, { expectedTotalPaise: 99_900 }),
      ]);

      expect(responses.map((response) => response.status).toSorted()).toEqual([201, 409]);
      expect(responses.find((response) => response.status === 409)?.body).toMatchObject({
        error: { code: 'ITEMS_UNAVAILABLE' },
      });
      expect(await stockOf(lastUnit.id)).toEqual({ stockQuantity: 1, reservedQuantity: 1 });
      expect(await prisma.orderItem.count({ where: { productId: lastUnit.id } })).toBe(1);

      // Clear the loser's cart for the next round.
      await prisma.cartItem.deleteMany();
    }
  });

  it('never reserves more than the stock when many customers order at once', async () => {
    const customers = [user, ...(await Promise.all(Array.from({ length: 7 }, () => signUp())))];
    for (const customer of customers) {
      await addToCart(customer, kettle.id, 1);
    }

    const responses = await Promise.all(
      customers.map((customer) => checkout(customer, { expectedTotalPaise: 150_000 })),
    );

    // 8 customers, 5 kettles.
    expect(responses.filter((response) => response.status === 201)).toHaveLength(5);
    expect(responses.filter((response) => response.status === 409)).toHaveLength(3);
    expect(await stockOf(kettle.id)).toEqual({ stockQuantity: 5, reservedQuantity: 5 });
  });

  it('does not deadlock when carts hold the same products in different orders', async () => {
    const customers = [user, ...(await Promise.all(Array.from({ length: 5 }, () => signUp())))];
    for (const [index, customer] of customers.entries()) {
      const [first, second] = index % 2 === 0 ? [kettle, knife] : [knife, kettle];
      await prisma.product.update({ where: { id: kettle.id }, data: { stockQuantity: 50 } });
      await addToCart(customer, first.id, 1);
      await addToCart(customer, second.id, 1);
    }

    const responses = await Promise.all(
      customers.map((customer) => checkout(customer, { expectedTotalPaise: 450_050 })),
    );

    expect(responses.map((response) => response.status)).toEqual(Array(6).fill(201));
    expect(await stockOf(kettle.id)).toMatchObject({ reservedQuantity: 6 });
    expect(await stockOf(knife.id)).toMatchObject({ reservedQuantity: 6 });
  });
});

describe('idempotent checkout', () => {
  it('returns the same order when a request is repeated with the same key', async () => {
    await addToCart(user, kettle.id, 2);
    const key = randomUUID();

    const first = await checkout(user, { key, expectedTotalPaise: 300_000 });
    const repeat = await checkout(user, { key, expectedTotalPaise: 300_000 });

    expect(first.status).toBe(201);
    expect(repeat.status).toBe(200);
    expect(orderIn(repeat).id).toBe(orderIn(first).id);
    expect(await prisma.order.count()).toBe(1);
    expect(await stockOf(kettle.id)).toMatchObject({ reservedQuantity: 2 });
  });

  it('creates one order when the same request arrives several times at once', async () => {
    await addToCart(user, kettle.id, 2);
    const key = randomUUID();

    const responses = await Promise.all(
      Array.from({ length: 5 }, () => checkout(user, { key, expectedTotalPaise: 300_000 })),
    );

    expect(responses.map((response) => response.status).toSorted()).toEqual([
      200, 200, 200, 200, 201,
    ]);
    expect(new Set(responses.map((response) => orderIn(response).id)).size).toBe(1);
    expect(await prisma.order.count()).toBe(1);
    expect(await stockOf(kettle.id)).toMatchObject({ reservedQuantity: 2 });
  });

  it('treats the same key from another customer as a different checkout', async () => {
    const otherUser = await signUp();
    const key = randomUUID();
    await addToCart(user, kettle.id, 1);
    await addToCart(otherUser, kettle.id, 1);

    const first = await checkout(user, { key, expectedTotalPaise: 150_000 });
    const second = await checkout(otherUser, { key, expectedTotalPaise: 150_000 });

    expect([first.status, second.status]).toEqual([201, 201]);
    expect(orderIn(second).id).not.toBe(orderIn(first).id);
  });

  it('lets a failed checkout be retried with the same key', async () => {
    await addToCart(user, kettle.id, 1);
    const key = randomUUID();

    const failed = await checkout(user, { key, expectedTotalPaise: 1 });
    const retried = await checkout(user, { key, expectedTotalPaise: 150_000 });

    expect([failed.status, retried.status]).toEqual([409, 201]);
  });
});

describe('reservation expiry', () => {
  it('expires an overdue order and returns its stock', async () => {
    await addToCart(user, kettle.id, 2);
    await addToCart(user, knife.id, 3);
    const order = await placeOrder(user);
    await makeOverdue(order.id);

    expect(await expireOverdueOrders()).toBe(1);

    expect(await stockOf(kettle.id)).toEqual({ stockQuantity: 5, reservedQuantity: 0 });
    expect(await stockOf(knife.id)).toEqual({ stockQuantity: 50, reservedQuantity: 0 });
    expect(await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).toMatchObject({
      status: 'EXPIRED',
      reservationExpiresAt: null,
    });
  });

  it('leaves orders that are still within their reservation', async () => {
    await addToCart(user, kettle.id, 2);
    const order = await placeOrder(user);

    expect(await expireOverdueOrders()).toBe(0);
    expect(await expireOrder(order.id)).toBe(false);
    expect(await stockOf(kettle.id)).toMatchObject({ reservedQuantity: 2 });
  });

  it('releases the stock once, however many times expiry runs', async () => {
    await addToCart(user, kettle.id, 2);
    const order = await placeOrder(user);
    // Stock reserved by someone else, which a double release would wrongly free.
    await prisma.product.update({ where: { id: kettle.id }, data: { reservedQuantity: 5 } });
    await makeOverdue(order.id);

    const results = await Promise.all([
      expireOrder(order.id),
      expireOrder(order.id),
      expireOverdueOrders(),
      expireOverdueOrders(),
    ]);

    expect(results.filter((result) => result === true || result === 1)).toHaveLength(1);
    expect(await expireOverdueOrders()).toBe(0);
    expect(await stockOf(kettle.id)).toEqual({ stockQuantity: 5, reservedQuantity: 3 });
  });

  it('makes the released units available to the next customer', async () => {
    const lastUnit = await createProduct('Limited Lamp', 99_900, 1);
    await addToCart(user, lastUnit.id);
    const order = await placeOrder(user);
    const otherUser = await signUp();
    expect(
      (
        await post('/api/v1/cart/items')
          .set('Cookie', otherUser.cookie)
          .send({ productId: lastUnit.id })
      ).status,
    ).toBe(409);

    await makeOverdue(order.id);
    await expireOverdueOrders();
    await addToCart(otherUser, lastUnit.id);

    expect((await checkout(otherUser)).status).toBe(201);
  });

  it('shows an overdue order as expired as soon as its owner looks at it', async () => {
    await addToCart(user, kettle.id, 2);
    const order = await placeOrder(user);
    await makeOverdue(order.id);

    const detail = await getOrder(user, order.id);
    const list = await request(app).get('/api/v1/orders').set('Cookie', user.cookie);

    expect(orderIn(detail)).toMatchObject({ status: 'EXPIRED', reservationExpiresAt: null });
    expect(list.body).toMatchObject({ data: [{ id: order.id, status: 'EXPIRED' }] });
    expect(await stockOf(kettle.id)).toMatchObject({ reservedQuantity: 0 });
  });

  it('continues with the remaining orders when one cannot be expired', async () => {
    const otherUser = await signUp();
    await addToCart(user, kettle.id, 2);
    await addToCart(otherUser, knife.id, 1);
    const brokenOrder = await placeOrder(user);
    const healthyOrder = await placeOrder(otherUser);
    await makeOverdue(brokenOrder.id);
    await makeOverdue(healthyOrder.id);
    // Releasing 2 units when none are reserved violates the stock constraint and rolls back.
    await prisma.product.update({ where: { id: kettle.id }, data: { reservedQuantity: 0 } });

    expect(await expireOverdueOrders()).toBe(1);

    const statusOf = async (orderId: string) =>
      (await prisma.order.findUniqueOrThrow({ where: { id: orderId } })).status;
    expect(await statusOf(healthyOrder.id)).toBe('EXPIRED');
    // Left untouched for the next run, not half-expired.
    expect(await statusOf(brokenOrder.id)).toBe('PENDING_PAYMENT');
    expect(await stockOf(knife.id)).toMatchObject({ reservedQuantity: 0 });
  });
});

describe('POST /api/v1/orders/:orderId/cancel', () => {
  it('cancels an order awaiting payment and returns its stock', async () => {
    await addToCart(user, kettle.id, 2);
    const order = await placeOrder(user);

    const response = await cancelOrder(user, order.id);

    expect(response.status).toBe(200);
    expect(orderIn(response)).toMatchObject({ status: 'CANCELLED', reservationExpiresAt: null });
    expect(await stockOf(kettle.id)).toEqual({ stockQuantity: 5, reservedQuantity: 0 });
  });

  it('refuses a second cancellation and does not release the stock twice', async () => {
    await addToCart(user, kettle.id, 2);
    const order = await placeOrder(user);
    await prisma.product.update({ where: { id: kettle.id }, data: { reservedQuantity: 5 } });

    const responses = await Promise.all([cancelOrder(user, order.id), cancelOrder(user, order.id)]);
    const again = await cancelOrder(user, order.id);

    expect(responses.map((response) => response.status).toSorted()).toEqual([200, 409]);
    expect(again.status).toBe(409);
    expect(again.body).toMatchObject({ error: { code: 'ORDER_NOT_CANCELLABLE' } });
    expect(await stockOf(kettle.id)).toMatchObject({ reservedQuantity: 3 });
  });

  it.each(['PAID', 'SHIPPED', 'EXPIRED'] as const)(
    'refuses to cancel a %s order',
    async (status) => {
      await addToCart(user, kettle.id, 2);
      const order = await placeOrder(user);
      await prisma.order.update({ where: { id: order.id }, data: { status } });

      const response = await cancelOrder(user, order.id);

      expect(response.status).toBe(409);
      expect(await stockOf(kettle.id)).toMatchObject({ reservedQuantity: 2 });
    },
  );
});

describe('payment confirmation (for the payment webhook)', () => {
  it('marks the order paid and turns the reservation into a sale', async () => {
    await addToCart(user, kettle.id, 2);
    const order = await placeOrder(user);

    expect(await confirmPayment(order.id)).toBe(true);

    expect(await stockOf(kettle.id)).toEqual({ stockQuantity: 3, reservedQuantity: 0 });
    expect(orderIn(await getOrder(user, order.id))).toMatchObject({
      status: 'PAID',
      reservationExpiresAt: null,
    });
  });

  it('has no effect when repeated', async () => {
    await addToCart(user, kettle.id, 2);
    const order = await placeOrder(user);

    const results = await Promise.all([confirmPayment(order.id), confirmPayment(order.id)]);

    expect(results.toSorted()).toEqual([false, true]);
    expect(await stockOf(kettle.id)).toEqual({ stockQuantity: 3, reservedQuantity: 0 });
  });

  it('does not revive an order that already expired or was cancelled', async () => {
    await addToCart(user, kettle.id, 2);
    const order = await placeOrder(user);
    await cancelOrder(user, order.id);

    expect(await confirmPayment(order.id)).toBe(false);
    expect(await stockOf(kettle.id)).toEqual({ stockQuantity: 5, reservedQuantity: 0 });
  });

  it('is not reachable over HTTP', async () => {
    await addToCart(user, kettle.id, 1);
    const order = await placeOrder(user);

    const attempts = await Promise.all([
      post(`/api/v1/orders/${order.id}/pay`).set('Cookie', user.cookie),
      post(`/api/v1/orders/${order.id}/confirm`).set('Cookie', user.cookie),
      request(app)
        .patch(`/api/v1/orders/${order.id}`)
        .set('Origin', 'http://localhost:3000')
        .set('Cookie', user.cookie)
        .send({ status: 'PAID' }),
    ]);

    expect(attempts.map((response) => response.status)).toEqual([404, 404, 404]);
    expect(orderIn(await getOrder(user, order.id)).status).toBe('PENDING_PAYMENT');
  });
});

describe('order access', () => {
  it("lists only the customer's own orders, newest first", async () => {
    const otherUser = await signUp();
    await addToCart(user, kettle.id, 1);
    const first = await placeOrder(user);
    await addToCart(user, knife.id, 2);
    const second = await placeOrder(user);
    await addToCart(otherUser, knife.id, 1);
    await placeOrder(otherUser);

    const response = await request(app).get('/api/v1/orders').set('Cookie', user.cookie);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      data: [
        { id: second.id, status: 'PENDING_PAYMENT', totalPaise: 600_100, itemCount: 2 },
        { id: first.id, status: 'PENDING_PAYMENT', totalPaise: 150_000, itemCount: 1 },
      ],
      meta: { page: 1, pageSize: 10, totalItems: 2, totalPages: 1 },
    });
  });

  it("does not let a customer view or cancel another customer's order", async () => {
    const otherUser = await signUp();
    await addToCart(user, kettle.id, 2);
    const order = await placeOrder(user);

    const view = await getOrder(otherUser, order.id);
    const cancellation = await cancelOrder(otherUser, order.id);
    const unknown = await getOrder(otherUser, UNKNOWN_ID);

    expect(view.status).toBe(404);
    expect(view.body).toEqual(unknown.body);
    expect(cancellation.status).toBe(404);
    expect(orderIn(await getOrder(user, order.id)).status).toBe('PENDING_PAYMENT');
    expect(await stockOf(kettle.id)).toMatchObject({ reservedQuantity: 2 });
  });

  it.each([
    ['GET', '/api/v1/orders'],
    ['POST', '/api/v1/orders'],
    ['GET', `/api/v1/orders/${UNKNOWN_ID}`],
    ['POST', `/api/v1/orders/${UNKNOWN_ID}/cancel`],
  ] as const)('rejects %s %s without a session', async (method, path) => {
    const response = await request(app)
      [method.toLowerCase() as 'get'](path)
      .set('Origin', 'http://localhost:3000');

    expect(response.status).toBe(401);
  });

  it('rejects a checkout that does not come from the web app origin', async () => {
    await addToCart(user, kettle.id, 1);

    const response = await request(app)
      .post('/api/v1/orders')
      .set('Origin', 'https://evil.example')
      .set('Cookie', user.cookie)
      .set('Idempotency-Key', randomUUID())
      .send({ shippingAddress: address, expectedTotalPaise: 150_000 });

    expect(response.status).toBe(403);
    expect(await prisma.order.count()).toBe(0);
  });

  it('rejects a malformed order id', async () => {
    expect((await getOrder(user, 'not-an-id')).status).toBe(400);
  });
});
