import type { PrismaClient } from '@cartforge/db';
import type { Page } from '@playwright/test';
import {
  addToCart,
  checkoutToSimulator,
  expect,
  newAccount,
  orderIdFromUrl,
  register,
  test,
  type Account,
} from '../support/fixtures.js';

/** Registers an account and promotes it, as `pnpm admin:create` would. Roles never come from input. */
async function signInAsAdmin(page: Page, db: PrismaClient): Promise<Account> {
  const account = newAccount('admin');
  await register(page, account);
  await db.user.update({ where: { email: account.email }, data: { role: 'ADMIN' } });
  return account;
}

test.describe('administration', () => {
  test('keeps customers and signed-out visitors out', async ({ page }) => {
    await page.goto('/admin');
    await expect(page).toHaveURL(/\/login/);

    await register(page, newAccount());
    const response = await page.goto('/admin');
    expect(response?.status()).toBe(404);
    const api = await page.evaluate(async () => (await fetch('/api/v1/admin/dashboard')).status);
    expect(api).toBe(403);
  });

  test('creates and edits a product that then appears on the storefront', async ({
    page,
    db,
    browser,
  }) => {
    await signInAsAdmin(page, db);
    const slug = `e2e-teapot-${Date.now()}`;

    await page.goto('/admin/products/new');
    await page.getByLabel('Name').fill('E2E Brass Teapot');
    await page.getByLabel('URL slug').fill(slug);
    await page.getByLabel('Description').fill('A one-litre brass teapot with a wooden handle.');
    await page.getByLabel('Price (₹)').fill('1499.50');
    await page.locator('#categoryId').selectOption({ label: 'Home & Kitchen' });
    await page.getByLabel('Units in stock').fill('6');
    await page.locator('#status').selectOption('ACTIVE');
    await page.getByRole('button', { name: 'Create product' }).click();
    await expect(page).toHaveURL(/\/admin\/products\/[0-9a-f-]{36}\/edit$/);

    const product = await db.product.findUniqueOrThrow({ where: { slug } });
    expect(product).toMatchObject({ pricePaise: 149_950, stockQuantity: 6, status: 'ACTIVE' });

    await page.getByLabel('Price (₹)').fill('1299');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByRole('status')).toContainText('Changes saved');

    const shopper = await (await browser.newContext()).newPage();
    await shopper.goto(`/products/${slug}`);
    await expect(shopper.getByRole('heading', { level: 1 })).toHaveText('E2E Brass Teapot');
    await expect(shopper.getByRole('main')).toContainText('₹1,299');
  });

  test('adjusts stock, and refuses to go below reserved units', async ({ page, db }) => {
    await signInAsAdmin(page, db);
    const slug = 'mens-cotton-kurta';
    const before = await db.product.findUniqueOrThrow({ where: { slug } });

    await page.goto('/admin/inventory');
    const row = page.locator('tbody tr', { hasText: before.name });
    await row.locator('input[name=delta]').fill('5');
    await row.getByRole('button', { name: 'Apply' }).click();
    await expect
      .poll(async () => (await db.product.findUniqueOrThrow({ where: { slug } })).stockQuantity)
      .toBe(before.stockQuantity + 5);

    await row.locator('input[name=delta]').fill(`-${before.stockQuantity + 1000}`);
    await row.getByRole('button', { name: 'Apply' }).click();
    await expect(row.getByRole('alert')).toBeVisible();
    expect((await db.product.findUniqueOrThrow({ where: { slug } })).stockQuantity).toBe(
      before.stockQuantity + 5,
    );

    // On the product page, with a reason, and listed in the history with the administrator.
    await page.goto(`/admin/products/${before.id}/edit`);
    await page.getByLabel(`Adjust stock of ${before.name}`).fill('-2');
    await page.getByLabel('Reason (optional)').fill('Two units damaged in transit');
    await page.getByRole('button', { name: 'Apply' }).click();
    const history = page.locator('section[aria-labelledby="history-heading"] li');
    await expect(history.first()).toContainText(`−2 → ${before.stockQuantity + 3}`);
    await expect(history.first()).toContainText('Two units damaged in transit');
    await expect(history.nth(1)).toContainText(`+5 → ${before.stockQuantity + 5}`);
  });

  test('moves a paid order through fulfilment, and the customer sees each status', async ({
    page,
    db,
    browser,
  }) => {
    // A customer pays for an order through the simulator.
    const customerContext = await browser.newContext();
    const customer = await customerContext.newPage();
    await register(customer, newAccount());
    await addToCart(customer, 'womens-running-shoes');
    await checkoutToSimulator(customer);
    await customer.getByRole('button', { name: 'Simulate successful payment' }).click();
    await expect(customer.getByRole('heading', { name: 'Payment confirmed' })).toBeVisible();
    const orderId = orderIdFromUrl(customer.url());

    await signInAsAdmin(page, db);
    await page.goto(`/admin/orders/${orderId}`);
    const actions = page.locator('section[aria-labelledby="actions-heading"]');
    await expect(actions.getByRole('button', { name: /paid/i })).toHaveCount(0);

    for (const [action, confirm, label] of [
      ['Start processing', 'Yes, start processing', 'Processing'],
      ['Mark as shipped', 'Yes, mark as shipped', 'Shipped'],
    ] as const) {
      await page.getByRole('button', { name: action }).click();
      await page.getByRole('button', { name: confirm }).click();
      await expect(page.locator('main h1 + span')).toHaveText(label);
      await customer.goto(`/orders/${orderId}`);
      await expect(customer.locator('main h1 + span')).toHaveText(label);
    }

    expect((await db.order.findUniqueOrThrow({ where: { id: orderId } })).status).toBe('SHIPPED');
    await customerContext.close();
  });
});
