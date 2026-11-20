import { createPrismaClient, type PrismaClient } from '@cartforge/db';
import { test as base, expect, type Page } from '@playwright/test';
import { createClient } from 'redis';
import { e2e } from './environment.js';

export { expect };

export interface Account {
  name: string;
  email: string;
  password: string;
}

let accountCounter = 0;

/** A new, unique account for one test. Nothing is shared between tests. */
export function newAccount(label = 'customer'): Account {
  accountCounter += 1;
  return {
    name: 'Asha Rao',
    email: `e2e-${label}-${Date.now()}-${accountCounter}@example.com`,
    password: 'correct horse battery staple',
  };
}

export async function register(page: Page, account: Account): Promise<void> {
  await page.goto('/register');
  await page.getByLabel('Name').fill(account.name);
  await page.getByLabel('Email').fill(account.email);
  await page.getByLabel('Password').fill(account.password);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/account$/);
}

export async function signIn(page: Page, account: Account): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email').fill(account.email);
  await page.getByLabel('Password').fill(account.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).not.toHaveURL(/\/login/);
}

export async function signOut(page: Page): Promise<void> {
  await page
    .getByRole('navigation', { name: 'Account' })
    .getByRole('button', { name: 'Sign out', exact: true })
    .click();
  await expect(page.getByRole('navigation', { name: 'Account' })).toContainText('Sign in');
}

/** The add-to-cart button, named for its product ("Add The Pragmatic Programmer to cart"). */
export function addToCartButton(page: Page) {
  return page.getByRole('main').getByRole('button', { name: /^Add .+ to cart$/ });
}

export async function addToCart(page: Page, slug: string): Promise<void> {
  await page.goto(`/products/${slug}`);
  await addToCartButton(page).click();
  await expect(addToCartButton(page)).toHaveText('Added to cart');
}

export async function fillShippingAddress(page: Page): Promise<void> {
  await page.getByLabel('Mobile number').fill('98765 43210');
  await page.getByLabel('Address', { exact: true }).fill('12 MG Road');
  await page.getByLabel('City').fill('Bengaluru');
  await page.getByLabel('PIN code').fill('560001');
  await page.locator('#state').selectOption('Karnataka');
}

/** From a non-empty cart: places the order and arrives on the labelled payment simulator. */
export async function checkoutToSimulator(page: Page): Promise<void> {
  await page.goto('/checkout');
  await fillShippingAddress(page);
  await page.getByRole('button', { name: 'Place order and pay' }).click();
  await expect(page).toHaveURL(/\/dev\/payment-simulator\/cs_sim_[0-9a-f]{32}$/);
  await expect(page.getByText('Development simulator · not Stripe')).toBeVisible();
}

export const test = base.extend<{ resetRateLimits: undefined }, { db: PrismaClient }>({
  db: [
    async ({}, use) => {
      const prisma = createPrismaClient(e2e.databaseUrl);
      await use(prisma);
      await prisma.$disconnect();
    },
    { scope: 'worker' },
  ],
  // Every browser request in the suite comes from this machine, so per-address limits
  // (10 registrations an hour) would otherwise carry over between tests.
  resetRateLimits: [
    async ({}, use) => {
      const client = await createClient({ url: e2e.redisUrl }).connect();
      for await (const keys of client.scanIterator({ MATCH: `${e2e.keyPrefix}ratelimit:*` })) {
        if (keys.length > 0) {
          await client.del(keys);
        }
      }
      await client.close();
      await use(undefined);
    },
    { auto: true },
  ],
});

/** The order id shown in the URL of an order page. */
export function orderIdFromUrl(url: string): string {
  const match = /\/orders\/([0-9a-f-]{36})/.exec(url);
  if (!match?.[1]) {
    throw new Error(`No order id in ${url}`);
  }
  return match[1];
}
