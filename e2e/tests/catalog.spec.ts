import type { Page } from '@playwright/test';
import { addToCartButton, expect, test } from '../support/fixtures.js';

const productLinks = (page: Page) => page.getByRole('main').locator('article');

test.describe('catalog', () => {
  test('searches by name', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('searchbox').first().fill('steel');
    await page.getByRole('searchbox').first().press('Enter');

    await expect(page).toHaveURL(/\/products\?q=steel/);
    await expect(page.getByRole('main')).toContainText('Stainless Steel Pressure Cooker, 5 L');
    for (const name of await productLinks(page).allInnerTexts()) {
      expect(name.toLowerCase()).toContain('steel');
    }
  });

  test('filters by category and price, and sorts by price', async ({ page, db }) => {
    await page.goto('/categories/books?sort=price_asc');
    const books = await db.product.findMany({
      where: { status: 'ACTIVE', category: { slug: 'books' } },
      orderBy: [{ pricePaise: 'asc' }, { id: 'asc' }],
      select: { name: true },
    });
    await expect(productLinks(page)).toHaveCount(books.length);
    await expect(productLinks(page).first()).toContainText(books[0]?.name ?? '');

    await page.goto('/products?maxPrice=1000');
    const affordable = await db.product.count({
      where: { status: 'ACTIVE', pricePaise: { lte: 100_000 } },
    });
    await expect(page.getByRole('main')).toContainText(
      `${affordable} product${affordable === 1 ? '' : 's'}`,
    );
  });

  test('shows a product with its price and stock', async ({ page, db }) => {
    const product = await db.product.findUniqueOrThrow({
      where: { slug: 'the-pragmatic-programmer' },
    });

    await page.goto('/products/the-pragmatic-programmer');

    await expect(page.getByRole('heading', { level: 1 })).toHaveText(product.name);
    await expect(page.getByRole('main')).toContainText(
      `₹${(product.pricePaise / 100).toLocaleString('en-IN')}`,
    );
    await expect(addToCartButton(page)).toHaveText('Add to cart');
  });

  test('marks a product with no stock as unavailable', async ({ page }) => {
    await page.goto('/products/smart-fitness-band');

    await expect(page.getByRole('main')).toContainText(/out of stock/i);
    await expect(addToCartButton(page)).toHaveCount(0);
  });

  test('answers 404 for a product that does not exist', async ({ page }) => {
    const response = await page.goto('/products/no-such-product');

    expect(response?.status()).toBe(404);
  });
});
