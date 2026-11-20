import type { PrismaClient } from '@cartforge/db';
import {
  addToCart,
  checkoutToSimulator,
  expect,
  fillShippingAddress,
  newAccount,
  orderIdFromUrl,
  register,
  test,
} from '../support/fixtures.js';

const stockOf = (db: PrismaClient, slug: string) =>
  db.product.findUniqueOrThrow({
    where: { slug },
    select: { stockQuantity: true, reservedQuantity: true },
  });

test.describe('checkout and payment (development simulator, not Stripe)', () => {
  test('validates the shipping address before placing the order', async ({ page, db }) => {
    const account = newAccount();
    await register(page, account);
    await addToCart(page, 'cast-iron-dosa-tawa-30cm');
    await page.goto('/checkout');

    await page.getByLabel('Mobile number').fill('12345');
    await page.getByLabel('PIN code').fill('0123');
    await page.getByRole('button', { name: 'Place order and pay' }).click();

    await expect(page.getByText('Enter a valid 10-digit mobile number')).toBeVisible();
    await expect(page.getByText('Enter a valid 6-digit PIN code')).toBeVisible();
    await expect(page.getByText('Enter the address')).toBeVisible();
    await expect(page).toHaveURL(/\/checkout$/);
    expect(await db.order.count({ where: { user: { email: account.email } } })).toBe(0);
  });

  test('places an order, pays, and sells the reserved stock', async ({ page, db }) => {
    const before = await stockOf(db, 'designing-data-intensive-applications');
    await register(page, newAccount());
    await addToCart(page, 'designing-data-intensive-applications');

    await checkoutToSimulator(page);
    const reserved = await stockOf(db, 'designing-data-intensive-applications');
    expect(reserved.reservedQuantity).toBe(before.reservedQuantity + 1);

    await page.getByRole('button', { name: 'Simulate successful payment' }).click();
    await expect(page).toHaveURL(/\/payment\/success/);
    await expect(page.getByRole('heading', { name: 'Payment confirmed' })).toBeVisible();
    const orderId = orderIdFromUrl(page.url());

    const after = await stockOf(db, 'designing-data-intensive-applications');
    expect(after).toEqual({
      stockQuantity: before.stockQuantity - 1,
      reservedQuantity: before.reservedQuantity,
    });
    const order = await db.order.findUniqueOrThrow({
      where: { id: orderId },
      include: { payments: true },
    });
    expect(order.status).toBe('PAID');
    expect(order.payments.map((payment) => payment.status)).toEqual(['SUCCEEDED']);

    // The cart was emptied, and the order appears in the history as paid.
    await page.goto('/cart');
    await expect(page.getByText('Your cart is empty')).toBeVisible();
    await page.goto('/orders');
    const row = page
      .getByRole('main')
      .getByRole('link', { name: new RegExp(orderId.slice(-8), 'i') });
    await expect(row).toBeVisible();
    await expect(page.getByRole('main')).toContainText('Paid');
  });

  test('recovers from a failed payment with a successful retry', async ({ page, db }) => {
    await register(page, newAccount());
    await addToCart(page, 'glass-storage-jars-set-of-6');
    await checkoutToSimulator(page);

    await page.getByRole('button', { name: 'Simulate failed payment' }).click();
    await expect(page).toHaveURL(/\/orders\/[0-9a-f-]{36}$/);
    const orderId = orderIdFromUrl(page.url());
    await expect(page.getByRole('main')).toContainText('Awaiting payment');
    expect((await db.order.findUniqueOrThrow({ where: { id: orderId } })).status).toBe(
      'PENDING_PAYMENT',
    );

    await page.getByRole('button', { name: 'Try payment again' }).click();
    await expect(page).toHaveURL(/\/dev\/payment-simulator\//);
    await page.getByRole('button', { name: 'Simulate successful payment' }).click();
    await expect(page.getByRole('heading', { name: 'Payment confirmed' })).toBeVisible();

    const payments = await db.payment.findMany({
      where: { orderId },
      orderBy: { createdAt: 'asc' },
      select: { status: true },
    });
    expect(payments.map((payment) => payment.status)).toEqual(['FAILED', 'SUCCEEDED']);
  });

  test('lets the customer cancel an unpaid order and returns its stock', async ({ page, db }) => {
    const before = await stockOf(db, 'cotton-bedsheet-set-king');
    await register(page, newAccount());
    await addToCart(page, 'cotton-bedsheet-set-king');
    await page.goto('/checkout');
    await fillShippingAddress(page);
    await page.getByRole('button', { name: 'Place order and pay' }).click();
    await expect(page).toHaveURL(/\/dev\/payment-simulator\//);

    await page.getByRole('link', { name: 'Cancel and return' }).click();
    await expect(page).toHaveURL(/\/payment\/cancelled/);
    const orderId = orderIdFromUrl(page.url());
    await page.goto(`/orders/${orderId}`);
    await page.getByRole('button', { name: 'Cancel order' }).click();
    await page.getByRole('button', { name: 'Yes, cancel order' }).click();

    await expect(page.getByRole('main')).toContainText('Cancelled');
    expect(await stockOf(db, 'cotton-bedsheet-set-king')).toEqual(before);
  });
});
