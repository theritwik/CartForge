import { randomUUID } from 'node:crypto';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
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

/** Matches the Prisma error raised when PostgreSQL rejects a statement, by constraint or message. */
function databaseRejection(messageFragment: string) {
  return {
    meta: {
      driverAdapterError: {
        cause: { originalMessage: expect.stringContaining(messageFragment) as unknown },
      },
    },
  };
}

let uniqueCounter = 0;
function unique(prefix: string): string {
  uniqueCounter += 1;
  return `${prefix}-${uniqueCounter}`;
}

function createUser() {
  return prisma.user.create({
    data: { email: `${unique('user')}@example.com`, passwordHash: 'not-a-real-hash', name: 'Asha' },
  });
}

async function createProduct(overrides: { pricePaise?: number; stockQuantity?: number } = {}) {
  const slug = unique('product');
  return prisma.product.create({
    data: {
      name: `Product ${slug}`,
      slug,
      description: 'A product used in tests.',
      pricePaise: overrides.pricePaise ?? 49_900,
      stockQuantity: overrides.stockQuantity ?? 10,
      category: { create: { name: unique('Category'), slug: unique('category') } },
    },
  });
}

async function createOrder(
  userId: string,
  product: { id: string; name: string; pricePaise: number },
) {
  return prisma.order.create({
    data: {
      userId,
      idempotencyKey: randomUUID(),
      totalPaise: product.pricePaise * 2,
      shippingName: 'Asha Rao',
      shippingPhone: '+919800000000',
      shippingAddressLine1: '12 MG Road',
      shippingCity: 'Bengaluru',
      shippingState: 'Karnataka',
      shippingPostalCode: '560001',
      items: {
        create: {
          productId: product.id,
          productName: product.name,
          unitPricePaise: product.pricePaise,
          quantity: 2,
        },
      },
    },
    include: { items: true },
  });
}

describe('users and sessions', () => {
  it('applies defaults for role and timestamps', async () => {
    const user = await createUser();

    expect(user.role).toBe('CUSTOMER');
    expect(user.createdAt).toBeInstanceOf(Date);
    expect(user.updatedAt).toBeInstanceOf(Date);
  });

  it('rejects a duplicate email', async () => {
    const user = await createUser();

    await expect(
      prisma.user.create({ data: { email: user.email, passwordHash: 'hash', name: 'Other' } }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  it('rejects an email that is not lowercase', async () => {
    await expect(
      prisma.user.create({
        data: { email: 'Asha@Example.com', passwordHash: 'hash', name: 'Asha' },
      }),
    ).rejects.toMatchObject(databaseRejection('users_email_lowercase_check'));
  });

  it('rejects a duplicate session token hash', async () => {
    const user = await createUser();
    const session = { userId: user.id, tokenHash: 'a'.repeat(64), expiresAt: new Date() };
    await prisma.session.create({ data: session });

    await expect(prisma.session.create({ data: session })).rejects.toMatchObject({ code: 'P2002' });
  });

  it('deletes sessions and the cart when the user is deleted', async () => {
    const user = await createUser();
    await prisma.session.create({
      data: { userId: user.id, tokenHash: 'b'.repeat(64), expiresAt: new Date() },
    });
    await prisma.cart.create({ data: { userId: user.id } });

    await prisma.user.delete({ where: { id: user.id } });

    expect(await prisma.session.count()).toBe(0);
    expect(await prisma.cart.count()).toBe(0);
  });
});

describe('catalog', () => {
  it('creates products as drafts with no stock by default', async () => {
    const category = await prisma.category.create({ data: { name: 'Books', slug: 'books' } });
    const product = await prisma.product.create({
      data: {
        categoryId: category.id,
        name: 'Notebook',
        slug: 'notebook',
        description: 'Ruled notebook.',
        pricePaise: 9_900,
      },
    });

    expect(product).toMatchObject({ status: 'DRAFT', stockQuantity: 0, reservedQuantity: 0 });
  });

  it('rejects duplicate category and product slugs', async () => {
    const product = await createProduct();

    await expect(
      prisma.category.create({
        data: {
          name: 'Another',
          slug: (await prisma.category.findFirstOrThrow()).slug,
        },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
    await expect(
      prisma.product.create({
        data: {
          categoryId: product.categoryId,
          name: 'Copy',
          slug: product.slug,
          description: 'Copy.',
          pricePaise: 100,
        },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  it('rejects a negative price', async () => {
    await expect(createProduct({ pricePaise: -1 })).rejects.toMatchObject(
      databaseRejection('products_price_paise_check'),
    );
  });

  it('rejects negative stock', async () => {
    // Either the stock check or the reserved <= stock check fires first.
    await expect(createProduct({ stockQuantity: -1 })).rejects.toMatchObject(
      databaseRejection('violates check constraint "products_'),
    );
  });

  it('rejects reserving more units than are in stock', async () => {
    const product = await createProduct({ stockQuantity: 3 });

    await prisma.product.update({ where: { id: product.id }, data: { reservedQuantity: 3 } });
    await expect(
      prisma.product.update({ where: { id: product.id }, data: { reservedQuantity: 4 } }),
    ).rejects.toMatchObject(databaseRejection('products_reserved_quantity_check'));
  });

  it('refuses to delete a category that still has products', async () => {
    const product = await createProduct();

    await expect(
      prisma.category.delete({ where: { id: product.categoryId } }),
    ).rejects.toMatchObject({ code: 'P2003' });
  });

  it('allows one image per position and deletes images with the product', async () => {
    const product = await createProduct();
    const image = { productId: product.id, url: 'https://example.com/a.png', altText: 'Front' };
    await prisma.productImage.create({ data: image });

    await expect(prisma.productImage.create({ data: image })).rejects.toMatchObject({
      code: 'P2002',
    });

    await prisma.productImage.create({ data: { ...image, position: 1 } });
    await prisma.product.delete({ where: { id: product.id } });
    expect(await prisma.productImage.count()).toBe(0);
  });
});

describe('carts', () => {
  it('allows only one cart per user', async () => {
    const user = await createUser();
    await prisma.cart.create({ data: { userId: user.id } });

    await expect(prisma.cart.create({ data: { userId: user.id } })).rejects.toMatchObject({
      code: 'P2002',
    });
  });

  it('allows a product only once per cart', async () => {
    const user = await createUser();
    const product = await createProduct();
    const cart = await prisma.cart.create({ data: { userId: user.id } });
    const item = { cartId: cart.id, productId: product.id, quantity: 1 };
    await prisma.cartItem.create({ data: item });

    await expect(prisma.cartItem.create({ data: item })).rejects.toMatchObject({ code: 'P2002' });
  });

  it('rejects a quantity below one', async () => {
    const user = await createUser();
    const product = await createProduct();
    const cart = await prisma.cart.create({ data: { userId: user.id } });

    await expect(
      prisma.cartItem.create({ data: { cartId: cart.id, productId: product.id, quantity: 0 } }),
    ).rejects.toMatchObject(databaseRejection('cart_items_quantity_check'));
  });
});

describe('orders', () => {
  it('starts in PENDING_PAYMENT', async () => {
    const order = await createOrder((await createUser()).id, await createProduct());

    expect(order.status).toBe('PENDING_PAYMENT');
  });

  it('keeps the purchase-time name and price when the product changes', async () => {
    const product = await createProduct({ pricePaise: 49_900 });
    const order = await createOrder((await createUser()).id, product);

    await prisma.product.update({
      where: { id: product.id },
      data: { name: 'Renamed product', pricePaise: 99_900 },
    });

    const [item] = await prisma.orderItem.findMany({ where: { orderId: order.id } });
    expect(item).toMatchObject({ productName: product.name, unitPricePaise: 49_900 });
  });

  it('rejects any update to an order item', async () => {
    const order = await createOrder((await createUser()).id, await createProduct());
    const itemId = order.items[0]?.id;

    await expect(
      prisma.orderItem.update({ where: { id: itemId }, data: { unitPricePaise: 1 } }),
    ).rejects.toMatchObject(databaseRejection('order_items rows are immutable'));
  });

  it('refuses to delete a product or user that has orders', async () => {
    const user = await createUser();
    const product = await createProduct();
    await createOrder(user.id, product);

    await expect(prisma.product.delete({ where: { id: product.id } })).rejects.toMatchObject({
      code: 'P2003',
    });
    await expect(prisma.user.delete({ where: { id: user.id } })).rejects.toMatchObject({
      code: 'P2003',
    });
  });

  it('rejects a non-positive item quantity', async () => {
    const product = await createProduct();
    const order = await createOrder((await createUser()).id, product);
    const otherProduct = await createProduct();

    await expect(
      prisma.orderItem.create({
        data: {
          orderId: order.id,
          productId: otherProduct.id,
          productName: otherProduct.name,
          unitPricePaise: otherProduct.pricePaise,
          quantity: 0,
        },
      }),
    ).rejects.toMatchObject(databaseRejection('order_items_quantity_check'));
  });
});

describe('payments', () => {
  const checkoutExpiresAt = new Date(Date.now() + 30 * 60 * 1000);

  it('allows several attempts for an order but only one that is pending', async () => {
    const order = await createOrder((await createUser()).id, await createProduct());
    const attempt = { orderId: order.id, amountPaise: order.totalPaise, checkoutExpiresAt };
    const first = await prisma.payment.create({ data: attempt });

    expect(first.status).toBe('PENDING');
    await expect(prisma.payment.create({ data: attempt })).rejects.toMatchObject(
      databaseRejection('payments_one_pending_per_order'),
    );

    await prisma.payment.update({ where: { id: first.id }, data: { status: 'EXPIRED' } });
    await prisma.payment.create({ data: attempt });
    expect(await prisma.payment.count({ where: { orderId: order.id } })).toBe(2);
  });

  it('allows a Checkout session and a PaymentIntent to belong to one payment only', async () => {
    const user = await createUser();
    const product = await createProduct();
    const firstOrder = await createOrder(user.id, product);
    const secondOrder = await createOrder(user.id, product);
    const identifiers = {
      stripeCheckoutSessionId: 'cs_test_1',
      stripePaymentIntentId: 'pi_test_1',
    };
    await prisma.payment.create({
      data: { orderId: firstOrder.id, amountPaise: 100, checkoutExpiresAt, ...identifiers },
    });

    for (const duplicate of [
      { stripeCheckoutSessionId: 'cs_test_1' },
      { stripePaymentIntentId: 'pi_test_1' },
    ]) {
      await expect(
        prisma.payment.create({
          data: { orderId: secondOrder.id, amountPaise: 100, checkoutExpiresAt, ...duplicate },
        }),
      ).rejects.toMatchObject({ code: 'P2002' });
    }
  });

  it('rejects a zero amount', async () => {
    const order = await createOrder((await createUser()).id, await createProduct());

    await expect(
      prisma.payment.create({ data: { orderId: order.id, amountPaise: 0, checkoutExpiresAt } }),
    ).rejects.toMatchObject(databaseRejection('payments_amount_paise_check'));
  });

  it('records a webhook event id only once', async () => {
    const event = { id: 'evt_test_1', type: 'checkout.session.completed' };

    const first = await prisma.processedStripeEvent.createMany({
      data: [event],
      skipDuplicates: true,
    });
    const second = await prisma.processedStripeEvent.createMany({
      data: [event],
      skipDuplicates: true,
    });

    expect([first.count, second.count]).toEqual([1, 0]);
  });
});
