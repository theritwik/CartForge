import { truncateAllTables } from '@cartforge/db/testing';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  app,
  clearRateLimits,
  del,
  patch,
  post,
  sessionCookieOf,
  signUp,
  type SignedUpUser,
} from '../../../tests/auth-helpers.js';
import { prisma } from '../../lib/prisma.js';
import { redis } from '../../lib/redis.js';

interface CartItem {
  id: string;
  quantity: number;
  availability: string;
  lineTotalPaise: number;
  product: { id: string; name: string; pricePaise: number; availableQuantity: number };
}
interface Cart {
  items: CartItem[];
  itemCount: number;
  subtotalPaise: number;
  hasItemsNeedingAttention: boolean;
  maxQuantityPerItem: number;
}

const UNKNOWN_ID = '01900000-0000-7000-8000-000000000000';

let kettle: { id: string };
let knife: { id: string };
let lamp: { id: string };
let soldOut: { id: string };
let draft: { id: string };
let user: SignedUpUser;

function cartOf(response: request.Response): Cart {
  return (response.body as { data: Cart }).data;
}

async function getCart(as: SignedUpUser): Promise<Cart> {
  return cartOf(await request(app).get('/api/v1/cart').set('Cookie', as.cookie));
}

function addItem(as: SignedUpUser, body: object) {
  return post('/api/v1/cart/items').set('Cookie', as.cookie).send(body);
}

function setQuantity(as: SignedUpUser, itemId: string, quantity: unknown) {
  return patch(`/api/v1/cart/items/${itemId}`).set('Cookie', as.cookie).send({ quantity });
}

function removeItem(as: SignedUpUser, itemId: string) {
  return del(`/api/v1/cart/items/${itemId}`).set('Cookie', as.cookie);
}

/** Adds a product and returns the resulting cart item. */
async function addedItem(as: SignedUpUser, productId: string, quantity = 1): Promise<CartItem> {
  const cart = cartOf(await addItem(as, { productId, quantity }));
  const item = cart.items.find((candidate) => candidate.product.id === productId);
  if (!item) {
    throw new Error('The product was not added to the cart.');
  }
  return item;
}

beforeAll(async () => {
  await redis.connect();
});

beforeEach(async () => {
  await truncateAllTables(prisma);
  await clearRateLimits();

  const category = await prisma.category.create({ data: { name: 'Kitchen', slug: 'kitchen' } });
  const createProduct = (
    name: string,
    pricePaise: number,
    stock: { stockQuantity: number; reservedQuantity?: number },
    status: 'ACTIVE' | 'DRAFT' = 'ACTIVE',
  ) =>
    prisma.product.create({
      data: {
        name,
        slug: name.toLowerCase().replaceAll(' ', '-'),
        description: `${name} for tests.`,
        pricePaise,
        status,
        categoryId: category.id,
        ...stock,
      },
    });

  kettle = await createProduct('Steel Kettle', 150_000, { stockQuantity: 5 });
  knife = await createProduct('Chef Knife', 300_050, { stockQuantity: 50 });
  lamp = await createProduct('Desk Lamp', 99_900, { stockQuantity: 8, reservedQuantity: 5 });
  soldOut = await createProduct('Cast Iron Pan', 200_000, {
    stockQuantity: 2,
    reservedQuantity: 2,
  });
  draft = await createProduct('Draft Mixer', 250_000, { stockQuantity: 9 }, 'DRAFT');
  user = await signUp();
});

afterAll(async () => {
  await redis.close();
  await prisma.$disconnect();
});

describe('GET /api/v1/cart', () => {
  it('returns an empty cart for a new customer without creating any rows', async () => {
    const response = await request(app).get('/api/v1/cart').set('Cookie', user.cookie);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      data: {
        items: [],
        itemCount: 0,
        subtotalPaise: 0,
        hasItemsNeedingAttention: false,
        maxQuantityPerItem: 10,
      },
    });
    expect(response.get('Cache-Control')).toBe('no-store');
    expect(await prisma.cart.count()).toBe(0);
  });
});

describe('POST /api/v1/cart/items', () => {
  it('adds a product and returns the cart with server-calculated totals', async () => {
    const response = await addItem(user, { productId: kettle.id, quantity: 2 });

    expect(response.status).toBe(200);
    expect(cartOf(response)).toEqual({
      items: [
        {
          id: expect.any(String) as unknown,
          quantity: 2,
          availability: 'AVAILABLE',
          lineTotalPaise: 300_000,
          product: {
            id: kettle.id,
            name: 'Steel Kettle',
            slug: 'steel-kettle',
            pricePaise: 150_000,
            image: null,
            availableQuantity: 5,
          },
        },
      ],
      itemCount: 2,
      subtotalPaise: 300_000,
      hasItemsNeedingAttention: false,
      maxQuantityPerItem: 10,
    });
  });

  it('defaults the quantity to one', async () => {
    expect(cartOf(await addItem(user, { productId: kettle.id })).itemCount).toBe(1);
  });

  it('raises the quantity instead of adding a second row for the same product', async () => {
    await addItem(user, { productId: kettle.id, quantity: 2 });
    const cart = cartOf(await addItem(user, { productId: kettle.id, quantity: 3 }));

    expect(cart.items).toHaveLength(1);
    expect(cart.items[0]).toMatchObject({ quantity: 5, lineTotalPaise: 750_000 });
    expect(await prisma.cartItem.count()).toBe(1);
  });

  it('does not reserve stock', async () => {
    await addItem(user, { productId: kettle.id, quantity: 5 });

    const product = await prisma.product.findUniqueOrThrow({ where: { id: kettle.id } });
    expect(product).toMatchObject({ stockQuantity: 5, reservedQuantity: 0 });
  });

  it.each([
    ['a malformed product id', { productId: 'kettle' }, 400, 'VALIDATION_ERROR'],
    ['a missing product id', {}, 400, 'VALIDATION_ERROR'],
    ['a product that does not exist', { productId: UNKNOWN_ID }, 404, 'PRODUCT_NOT_FOUND'],
  ])('rejects %s', async (_description, body, status, code) => {
    const response = await addItem(user, body);

    expect(response.status).toBe(status);
    expect(response.body).toMatchObject({ error: { code } });
    expect(await prisma.cartItem.count()).toBe(0);
  });

  it('rejects a product that is not published, without revealing that it exists', async () => {
    const response = await addItem(user, { productId: draft.id });
    const unknown = await addItem(user, { productId: UNKNOWN_ID });

    expect(response.status).toBe(404);
    expect(response.body).toEqual(unknown.body);
  });

  it.each([0, -1, 1.5, 11, '2', null])('rejects the quantity %j', async (quantity) => {
    const response = await addItem(user, { productId: kettle.id, quantity });
    const body = response.body as { error: { code: string; details: { path: string }[] } };

    expect(response.status).toBe(400);
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.details.map((detail) => detail.path)).toEqual(['quantity']);
  });

  it('rejects adding more than ten of one product in total', async () => {
    await addItem(user, { productId: knife.id, quantity: 8 });

    const response = await addItem(user, { productId: knife.id, quantity: 3 });

    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({
      error: { code: 'QUANTITY_LIMIT_EXCEEDED', details: { maxQuantityPerItem: 10 } },
    });
    expect((await getCart(user)).items[0]?.quantity).toBe(8);
  });

  it('rejects a product that is out of stock', async () => {
    const response = await addItem(user, { productId: soldOut.id });

    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({
      error: { code: 'OUT_OF_STOCK', details: { availableQuantity: 0 } },
    });
  });

  it('rejects more units than are available, counting units reserved by orders', async () => {
    // 8 in stock, 5 reserved: 3 can be bought.
    const response = await addItem(user, { productId: lamp.id, quantity: 4 });

    expect(response.status).toBe(409);
    expect(response.body).toEqual({
      error: {
        code: 'INSUFFICIENT_STOCK',
        message: 'Only 3 left in stock.',
        details: { availableQuantity: 3 },
      },
    });
    expect((await addItem(user, { productId: lamp.id, quantity: 3 })).status).toBe(200);
  });

  it('counts what is already in the cart against the available stock', async () => {
    await addItem(user, { productId: kettle.id, quantity: 4 });

    const response = await addItem(user, { productId: kettle.id, quantity: 2 });

    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({ error: { code: 'INSUFFICIENT_STOCK' } });
  });

  it('ignores prices, totals, and owners supplied by the client', async () => {
    const otherUser = await signUp();

    const response = await addItem(user, {
      productId: kettle.id,
      quantity: 1,
      pricePaise: 1,
      lineTotalPaise: 1,
      subtotalPaise: 1,
      userId: otherUser.id,
      cartId: UNKNOWN_ID,
    });

    expect(cartOf(response)).toMatchObject({ subtotalPaise: 150_000 });
    expect((await getCart(otherUser)).items).toEqual([]);
  });
});

describe('PATCH /api/v1/cart/items/:itemId', () => {
  it('sets the quantity and recalculates the totals', async () => {
    const item = await addedItem(user, kettle.id, 1);

    const increased = cartOf(await setQuantity(user, item.id, 4));
    const decreased = cartOf(await setQuantity(user, item.id, 2));

    expect(increased).toMatchObject({ itemCount: 4, subtotalPaise: 600_000 });
    expect(decreased).toMatchObject({ itemCount: 2, subtotalPaise: 300_000 });
  });

  it.each([0, -3, 2.5, 11, '3'])('rejects the quantity %j', async (quantity) => {
    const item = await addedItem(user, kettle.id, 2);

    const response = await setQuantity(user, item.id, quantity);

    expect(response.status).toBe(400);
    expect((await getCart(user)).items[0]?.quantity).toBe(2);
  });

  it('rejects raising the quantity above the available stock', async () => {
    const item = await addedItem(user, kettle.id, 2);

    const response = await setQuantity(user, item.id, 6);

    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({
      error: { code: 'INSUFFICIENT_STOCK', details: { availableQuantity: 5 } },
    });
  });

  it.each([
    ['an item that is not in the cart', UNKNOWN_ID, 404],
    ['a malformed item id', 'not-an-id', 400],
  ])('rejects %s', async (_description, itemId, status) => {
    expect((await setQuantity(user, itemId, 2)).status).toBe(status);
  });
});

describe('DELETE /api/v1/cart/items/:itemId', () => {
  it('removes the item and leaves the others', async () => {
    const kettleItem = await addedItem(user, kettle.id, 2);
    await addedItem(user, knife.id, 1);

    const cart = cartOf(await removeItem(user, kettleItem.id));

    expect(cart.items.map((item) => item.product.name)).toEqual(['Chef Knife']);
    expect(cart.subtotalPaise).toBe(300_050);
  });

  it('succeeds when the item is already gone', async () => {
    const item = await addedItem(user, kettle.id);
    await removeItem(user, item.id);

    const response = await removeItem(user, item.id);

    expect(response.status).toBe(200);
    expect(cartOf(response).items).toEqual([]);
  });
});

describe('DELETE /api/v1/cart', () => {
  it('removes every item', async () => {
    await addedItem(user, kettle.id, 2);
    await addedItem(user, knife.id, 1);

    const response = await del('/api/v1/cart').set('Cookie', user.cookie);

    expect(response.status).toBe(200);
    expect(cartOf(response)).toMatchObject({ items: [], itemCount: 0, subtotalPaise: 0 });
    expect(await prisma.cartItem.count()).toBe(0);
  });

  it('succeeds on an empty cart', async () => {
    expect((await del('/api/v1/cart').set('Cookie', user.cookie)).status).toBe(200);
  });
});

describe('server-side totals', () => {
  it('sums each line at the current database price', async () => {
    await addedItem(user, kettle.id, 2);
    await addedItem(user, knife.id, 3);

    const cart = await getCart(user);

    expect(cart.items.map((item) => item.lineTotalPaise)).toEqual([300_000, 900_150]);
    expect(cart.subtotalPaise).toBe(1_200_150);
    expect(cart.itemCount).toBe(5);
  });

  it('uses the new price after a product is repriced', async () => {
    await addedItem(user, kettle.id, 2);
    await prisma.product.update({ where: { id: kettle.id }, data: { pricePaise: 175_000 } });

    const cart = await getCart(user);

    expect(cart.items[0]).toMatchObject({ lineTotalPaise: 350_000 });
    expect(cart.subtotalPaise).toBe(350_000);
  });
});

describe('items that can no longer be bought', () => {
  it('keeps a withdrawn product in the cart, flagged and excluded from the subtotal', async () => {
    await addedItem(user, kettle.id, 2);
    await addedItem(user, knife.id, 1);
    await prisma.product.update({ where: { id: kettle.id }, data: { status: 'ARCHIVED' } });

    const cart = await getCart(user);

    expect(cart.items.map((item) => item.availability)).toEqual(['UNAVAILABLE', 'AVAILABLE']);
    expect(cart.items[0]?.product.availableQuantity).toBe(0);
    expect(cart.subtotalPaise).toBe(300_050);
    expect(cart.hasItemsNeedingAttention).toBe(true);
    expect(cart.itemCount).toBe(3);
  });

  it('flags an item when stock falls below its quantity, then when it runs out', async () => {
    await addedItem(user, kettle.id, 4);

    await prisma.product.update({ where: { id: kettle.id }, data: { stockQuantity: 3 } });
    const short = await getCart(user);
    await prisma.product.update({ where: { id: kettle.id }, data: { stockQuantity: 0 } });
    const gone = await getCart(user);

    expect(short.items[0]).toMatchObject({
      availability: 'INSUFFICIENT_STOCK',
      quantity: 4,
      product: { availableQuantity: 3 },
    });
    expect(short.subtotalPaise).toBe(0);
    expect(gone.items[0]).toMatchObject({ availability: 'OUT_OF_STOCK', quantity: 4 });
  });

  it('lets the customer lower the quantity to what is left, but not raise it', async () => {
    const item = await addedItem(user, kettle.id, 4);
    await prisma.product.update({ where: { id: kettle.id }, data: { stockQuantity: 3 } });

    const raised = await setQuantity(user, item.id, 5);
    const lowered = cartOf(await setQuantity(user, item.id, 3));

    expect(raised.status).toBe(409);
    expect(lowered.items[0]).toMatchObject({ availability: 'AVAILABLE', quantity: 3 });
    expect(lowered).toMatchObject({ subtotalPaise: 450_000, hasItemsNeedingAttention: false });
  });

  it('lets the customer lower or remove a withdrawn product, but not raise it', async () => {
    const item = await addedItem(user, kettle.id, 2);
    await prisma.product.update({ where: { id: kettle.id }, data: { status: 'ARCHIVED' } });

    expect((await setQuantity(user, item.id, 3)).status).toBe(404);
    expect((await setQuantity(user, item.id, 1)).status).toBe(200);
    expect(cartOf(await removeItem(user, item.id)).items).toEqual([]);
  });
});

describe('authentication', () => {
  it.each([
    ['GET', '/api/v1/cart'],
    ['DELETE', '/api/v1/cart'],
    ['POST', '/api/v1/cart/items'],
    ['PATCH', `/api/v1/cart/items/${UNKNOWN_ID}`],
    ['DELETE', `/api/v1/cart/items/${UNKNOWN_ID}`],
  ] as const)('rejects %s %s without a session', async (method, path) => {
    const response = await request(app)
      [method.toLowerCase() as 'get'](path)
      .set('Origin', 'http://localhost:3000')
      .send(method === 'GET' ? undefined : { productId: kettle.id, quantity: 1 });

    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({ error: { code: 'UNAUTHENTICATED' } });
  });

  it('rejects a cart change that does not come from the web app origin', async () => {
    const response = await request(app)
      .post('/api/v1/cart/items')
      .set('Origin', 'https://evil.example')
      .set('Cookie', user.cookie)
      .send({ productId: kettle.id });

    expect(response.status).toBe(403);
    expect((await getCart(user)).items).toEqual([]);
  });
});

describe('cart ownership', () => {
  it("keeps each customer's cart separate", async () => {
    const otherUser = await signUp();
    await addedItem(user, kettle.id, 2);
    await addedItem(otherUser, knife.id, 1);

    expect((await getCart(user)).items.map((item) => item.product.name)).toEqual(['Steel Kettle']);
    expect((await getCart(otherUser)).items.map((item) => item.product.name)).toEqual([
      'Chef Knife',
    ]);
  });

  it("does not let a customer change, remove, or clear another customer's items", async () => {
    const otherUser = await signUp();
    const item = await addedItem(user, kettle.id, 2);

    const update = await setQuantity(otherUser, item.id, 5);
    const removal = await removeItem(otherUser, item.id);
    await del('/api/v1/cart').set('Cookie', otherUser.cookie);

    expect(update.status).toBe(404);
    expect(update.body).toMatchObject({ error: { code: 'CART_ITEM_NOT_FOUND' } });
    expect(cartOf(removal).items).toEqual([]);
    expect((await getCart(user)).items).toMatchObject([{ id: item.id, quantity: 2 }]);
  });
});

describe('concurrent changes', () => {
  it('applies every simultaneous add of the same product to a single row', async () => {
    const responses = await Promise.all(
      Array.from({ length: 6 }, () => addItem(user, { productId: knife.id, quantity: 1 })),
    );

    expect(responses.map((response) => response.status)).toEqual(Array(6).fill(200));
    expect(await prisma.cart.count()).toBe(1);
    expect(await prisma.cartItem.findMany()).toMatchObject([{ quantity: 6 }]);
  });

  it('never exceeds the quantity limit under simultaneous adds', async () => {
    const responses = await Promise.all(
      Array.from({ length: 14 }, () => addItem(user, { productId: knife.id, quantity: 1 })),
    );
    const statuses = responses.map((response) => response.status);

    expect(statuses.filter((status) => status === 200)).toHaveLength(10);
    expect(statuses.filter((status) => status === 409)).toHaveLength(4);
    expect((await getCart(user)).items).toMatchObject([{ quantity: 10 }]);
  });

  it('never exceeds the available stock under simultaneous adds', async () => {
    const responses = await Promise.all(
      Array.from({ length: 8 }, () => addItem(user, { productId: kettle.id, quantity: 1 })),
    );

    expect(responses.filter((response) => response.status === 200)).toHaveLength(5);
    expect((await getCart(user)).items).toMatchObject([{ quantity: 5 }]);
  });

  it('adds different products at the same time without losing either', async () => {
    await Promise.all([
      addItem(user, { productId: kettle.id, quantity: 2 }),
      addItem(user, { productId: knife.id, quantity: 3 }),
    ]);

    expect((await getCart(user)).itemCount).toBe(5);
  });

  it('settles simultaneous quantity updates on one of the requested values', async () => {
    const item = await addedItem(user, knife.id, 1);

    const responses = await Promise.all([
      setQuantity(user, item.id, 3),
      setQuantity(user, item.id, 7),
    ]);

    expect(responses.map((response) => response.status)).toEqual([200, 200]);
    const [stored] = await prisma.cartItem.findMany();
    expect([3, 7]).toContain(stored?.quantity);
    expect(await prisma.cartItem.count()).toBe(1);
  });

  it('handles an update racing with a removal of the same item', async () => {
    const item = await addedItem(user, knife.id, 2);

    const [update, removal] = await Promise.all([
      setQuantity(user, item.id, 4),
      removeItem(user, item.id),
    ]);

    expect([200, 404]).toContain(update.status);
    expect(removal.status).toBe(200);
    expect((await getCart(user)).items).toEqual([]);
  });
});

describe('persistence', () => {
  it('keeps the cart after logging out and back in, and on another device', async () => {
    await addedItem(user, kettle.id, 2);
    await addedItem(user, knife.id, 1);

    await post('/api/v1/auth/logout').set('Cookie', user.cookie);
    const login = await post('/api/v1/auth/login').send({
      email: user.email,
      password: user.password,
    });
    const newCookie = sessionCookieOf(login);
    const cart = cartOf(
      await request(app)
        .get('/api/v1/cart')
        .set('Cookie', `${newCookie?.name}=${newCookie?.value}`),
    );

    expect(cart.items.map((item) => [item.product.name, item.quantity])).toEqual([
      ['Steel Kettle', 2],
      ['Chef Knife', 1],
    ]);
    expect(cart.subtotalPaise).toBe(600_050);
  });
});
